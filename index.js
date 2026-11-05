// import express from "express";
// import { MongoClient } from "mongodb";
// import "dotenv/config";
// import cors from "cors";
// const app = express();
// app.use(cors());
// app.use(express.json());
// const PORT = process.env.PORT || 5000;

// const client = new MongoClient(process.env.MONGODB_URI);

// export async function connectToMongoDB() {
//   try {
//     await client.connect();
//     console.log("You successfully connected to MongoDB!");
//     return client;
//   } catch (err) {
//     console.dir(err);
//   }
// }
// connectToMongoDB();

// app.get("/", (req, res) => {
//   res.send("Hello World from impactpulse-server");
// });

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

// ==========================================
// 1. EXPRESS CONFIGURATION
// ==========================================

const app = express();

const PORT = process.env.PORT || 5000;

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "2mb" }));

// ==========================================
// 2. MONGODB CONNECTION
// ==========================================

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from .env");
}

const client = new MongoClient(process.env.MONGODB_URI);

let db;
let eventsCollection;

async function connectToMongoDB() {
  try {
    await client.connect();

    db = client.db("impactpulse");

    eventsCollection = db.collection("events");

    // Create indexes
    await eventsCollection.createIndex({ eventDate: 1 });
    await eventsCollection.createIndex({ category: 1 });
    await eventsCollection.createIndex({ createdBy: 1 });
    await eventsCollection.createIndex({ "participants.userId": 1 });

    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function isValidId(id) {
  return typeof id === "string" && ObjectId.isValid(id);
}

function getEventId(event) {
  return event._id.toString();
}

function formatEvent(event) {
  return {
    ...event,
    _id: event._id.toString(),
    eventId: event._id.toString(),
    participantCount: event.participants?.length || 0,
    participants: event.participants || [],
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidHttpUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isEventDateInPast(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return true;
  }

  // Compare calendar dates using Bangladesh local time.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return date < today;
}

function validateEventData(data) {
  const {
    title,
    description,
    category,
    location,
    eventDate,
    startTime,
    endTime,
    volunteersNeeded,
    imageUrl,
  } = data;

  if (!title || typeof title !== "string" || title.trim().length < 5) {
    return "Event title must contain at least 5 characters.";
  }

  if (
    !description ||
    typeof description !== "string" ||
    description.trim().length < 20
  ) {
    return "Description must contain at least 20 characters.";
  }

  const allowedCategories = [
    "Education",
    "Environment",
    "Food",
    "Health",
    "Clothing",
    "Community",
    "Other",
  ];

  if (!allowedCategories.includes(category)) {
    return "Please select a valid event category.";
  }

  if (!location || typeof location !== "string" || location.trim().length < 3) {
    return "Please provide a valid event location.";
  }

  if (isEventDateInPast(eventDate)) {
    return "Event date must be today or a future date.";
  }

  if (
    !Number.isInteger(Number(volunteersNeeded)) ||
    Number(volunteersNeeded) < 1 ||
    Number(volunteersNeeded) > 10000
  ) {
    return "Volunteers needed must be between 1 and 10000.";
  }

  if (startTime && endTime && endTime <= startTime) {
    return "End time must be later than start time.";
  }

  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    return "Please provide a valid HTTP or HTTPS image URL.";
  }

  return null;
}

function getEventPayload(data) {
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    category: data.category,
    location: data.location.trim(),
    eventDate: data.eventDate,
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    volunteersNeeded: Number(data.volunteersNeeded),
    imageUrl: data.imageUrl?.trim() || "",
  };
}

// ==========================================
// 4. BETTER AUTH SESSION MIDDLEWARE
// ==========================================

async function authenticateUser(req, res, next) {
  try {
    const cookie = req.headers.cookie;

    if (!cookie) {
      return res.status(401).json({
        success: false,
        message: "Please log in to continue.",
      });
    }

    const response = await fetch(`${BETTER_AUTH_URL}/api/auth/get-session`, {
      method: "GET",
      headers: {
        cookie,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return res.status(401).json({
        success: false,
        message: "Your session is invalid or expired. Please log in again.",
      });
    }

    const sessionData = await response.json();

    if (!sessionData?.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    req.user = {
      id: String(sessionData.user.id),
      name: sessionData.user.name || "ImpactPulse User",
      email: sessionData.user.email || "",
      image: sessionData.user.image || "",
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(503).json({
      success: false,
      message: "Unable to verify your session. Please try again.",
    });
  }
}

// ==========================================
// 5. HOME AND HEALTH ROUTES
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to ImpactPulse API!",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "ImpactPulse server is running.",
    database: db ? "connected" : "disconnected",
  });
});

// ==========================================
// 6. GET ALL EVENTS
// Search, category filter and pagination
// ==========================================

app.get("/api/events", async (req, res, next) => {
  try {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const category =
      typeof req.query.category === "string" ? req.query.category : "";

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 9),
    );

    const filter = {};

    if (search) {
      const safeSearch = escapeRegex(search);

      filter.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
        { location: { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (category && category !== "All") {
      filter.category = category;
    }

    const total = await eventsCollection.countDocuments(filter);

    const events = await eventsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      events: events.map(formatEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 7. GET SINGLE EVENT
// ==========================================

app.get("/api/events/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    res.json({
      success: true,
      event: formatEvent(event),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 8. CREATE EVENT
// ==========================================

app.post("/api/events", authenticateUser, async (req, res, next) => {
  try {
    const validationError = validateEventData(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const payload = getEventPayload(req.body);

    const now = new Date();

    const newEvent = {
      ...payload,

      createdBy: req.user.id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,

      participants: [],

      createdAt: now,
      updatedAt: now,
    };

    const result = await eventsCollection.insertOne(newEvent);

    const createdEvent = await eventsCollection.findOne({
      _id: result.insertedId,
    });

    res.status(201).json({
      success: true,
      message: "Event created successfully.",
      event: formatEvent(createdEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 9. UPDATE EVENT
// Only event owner can update
// ==========================================

app.patch("/api/events/:id", authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const validationError = validateEventData(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own events.",
      });
    }

    const payload = getEventPayload(req.body);

    await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        createdBy: req.user.id,
      },
      {
        $set: {
          ...payload,
          updatedAt: new Date(),
        },
      },
    );

    const updatedEvent = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    res.json({
      success: true,
      message: "Event updated successfully.",
      event: formatEvent(updatedEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 10. DELETE EVENT
// Only event owner can delete
// ==========================================

app.delete("/api/events/:id", authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      createdBy: req.user.id,
    });

    if (result.deletedCount === 0) {
      const eventExists = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!eventExists) {
        return res.status(404).json({
          success: false,
          message: "Event not found.",
        });
      }

      return res.status(403).json({
        success: false,
        message: "You can only delete your own events.",
      });
    }

    res.json({
      success: true,
      message: "Event deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 11. JOIN EVENT
// Prevent duplicate joins and over-capacity
// ==========================================

app.post("/api/events/:id/join", authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const eventObjectId = new ObjectId(id);

    const event = await eventsCollection.findOne({
      _id: eventObjectId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (isEventDateInPast(event.eventDate)) {
      return res.status(400).json({
        success: false,
        message: "This event has already started or passed.",
      });
    }

    const alreadyJoined = (event.participants || []).some(
      (participant) => participant.userId === req.user.id,
    );

    if (alreadyJoined) {
      return res.status(409).json({
        success: false,
        message: "You have already joined this event.",
      });
    }

    const participant = {
      userId: req.user.id,
      name: req.user.name,
      joinedAt: new Date(),
    };

    // Atomic capacity check and participant insertion.
    const result = await eventsCollection.updateOne(
      {
        _id: eventObjectId,
        "participants.userId": { $ne: req.user.id },
        $expr: {
          $lt: [
            { $size: { $ifNull: ["$participants", []] } },
            "$volunteersNeeded",
          ],
        },
      },
      {
        $push: {
          participants: participant,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
    );

    if (result.modifiedCount === 0) {
      const latestEvent = await eventsCollection.findOne({
        _id: eventObjectId,
      });

      if (!latestEvent) {
        return res.status(404).json({
          success: false,
          message: "Event not found.",
        });
      }

      if (
        (latestEvent.participants || []).some(
          (item) => item.userId === req.user.id,
        )
      ) {
        return res.status(409).json({
          success: false,
          message: "You have already joined this event.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Sorry, all volunteer places are filled.",
      });
    }

    const updatedEvent = await eventsCollection.findOne({
      _id: eventObjectId,
    });

    res.json({
      success: true,
      message: "You joined the event successfully.",
      event: formatEvent(updatedEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 12. LEAVE EVENT
// ==========================================

app.delete(
  "/api/events/:id/leave",
  authenticateUser,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID.",
        });
      }

      const eventObjectId = new ObjectId(id);

      const result = await eventsCollection.updateOne(
        {
          _id: eventObjectId,
          "participants.userId": req.user.id,
        },
        {
          $pull: {
            participants: {
              userId: req.user.id,
            },
          },
          $set: {
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        const eventExists = await eventsCollection.findOne({
          _id: eventObjectId,
        });

        if (!eventExists) {
          return res.status(404).json({
            success: false,
            message: "Event not found.",
          });
        }

        return res.status(400).json({
          success: false,
          message: "You have not joined this event.",
        });
      }

      const updatedEvent = await eventsCollection.findOne({
        _id: eventObjectId,
      });

      res.json({
        success: true,
        message: "You left the event successfully.",
        event: formatEvent(updatedEvent),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ==========================================
// 13. GET MY CREATED EVENTS
// ==========================================

app.get("/api/my/events", authenticateUser, async (req, res, next) => {
  try {
    const events = await eventsCollection
      .find({
        createdBy: req.user.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      total: events.length,
      events: events.map(formatEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 14. GET MY JOINED EVENTS
// ==========================================

app.get("/api/my/joined-events", authenticateUser, async (req, res, next) => {
  try {
    const events = await eventsCollection
      .find({
        "participants.userId": req.user.id,
      })
      .sort({ eventDate: 1 })
      .toArray();

    res.json({
      success: true,
      total: events.length,
      events: events.map(formatEvent),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 15. 404 ROUTE
// ==========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ==========================================
// 16. GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error. Please try again later.",
  });
});

// ==========================================
// 17. START SERVER
// ==========================================

async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`ImpactPulse server running on port ${PORT}`);
      console.log(`API URL: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

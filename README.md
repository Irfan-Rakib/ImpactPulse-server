# ImpactPulse Server – REST API

The backend API for **ImpactPulse**, a social development events platform. It is built with Express.js and MongoDB, and it verifies user sessions through Better Auth.

🌐 **Live API:** [[Click Here](https://impact-pulse-server.vercel.app/)]

💻 **Client Repository:** [[Click Here](https://github.com/Irfan-Rakib/ImpactPulse-client)]

---

## ✨ Features

- **Event CRUD:** Create, read, update, and delete social service events.
- **Search and Filter:** Search events by title, description, or location, and filter by category.
- **Pagination:** Page through events with `page` and `limit` query parameters.
- **Join and Leave Events:** Users can volunteer for events and withdraw later.
- **Atomic Capacity Check:** Joining uses a single atomic MongoDB update, so an event can never exceed its volunteer limit, even with simultaneous requests.
- **Duplicate Join Protection:** A user cannot join the same event twice.
- **Ownership Protection:** Only the creator of an event can update or delete it.
- **Session Authentication:** Protected routes verify the user's Better Auth session.
- **Input Validation:** Validates titles, descriptions, categories, locations, dates, times, volunteer counts, and image URLs.
- **Safe Search:** User search input is regex-escaped to prevent regex injection.
- **Database Indexes:** Indexes on common query fields for faster lookups.
- **Consistent Responses:** Every response uses a `{ success, message, ... }` JSON shape.

---

## 🛠️ Technologies Used

- Node.js
- Express.js
- JavaScript (ES Modules)
- MongoDB with the MongoDB Node.js Driver
- CORS
- dotenv
- Better Auth (session verification)

---

## 📁 Project Structure

```text
server/
├── index.js        # Express app, MongoDB connection, middleware, and all routes
├── .env            # Environment variables (never commit this file)
└── package.json
```

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Create a `.env` file inside the `server` directory:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

CLIENT_URL=http://localhost:3000

BETTER_AUTH_URL=http://localhost:3000
```

### 3. Start the Server

```bash
npm run dev
```

The API will run at:

```text
http://localhost:5000
```

If `MONGODB_URI` is missing, the server stops immediately with an error. If the database connection fails, the process exits.

---

## 🔐 Environment Variables

| Variable          | Required | Default                 | Description                           |
| ----------------- | -------- | ----------------------- | ------------------------------------- |
| `MONGODB_URI`     | Yes      | –                       | MongoDB connection string             |
| `PORT`            | No       | `5000`                  | Port the server listens on            |
| `CLIENT_URL`      | No       | `http://localhost:3000` | Frontend URL allowed by CORS          |
| `BETTER_AUTH_URL` | No       | `http://localhost:3000` | URL of the app that hosts Better Auth |

**Security:** Never upload your `.env` file to GitHub.

---

## 🔑 Authentication

Protected routes use the `authenticateUser` middleware:

1. The server reads the `cookie` header from the incoming request.
2. It forwards the cookie to `BETTER_AUTH_URL/api/auth/get-session`.
3. If a valid session is returned, the user's `id`, `name`, `email`, and `image` are attached to `req.user`.
4. Otherwise the server responds with `401`. If the auth service cannot be reached, it responds with `503`.

The frontend must send requests with `credentials: "include"` so the session cookie is included.

---

## 🔗 API Endpoints

| Method | Endpoint                | Auth        | Description                             |
| ------ | ----------------------- | ----------- | --------------------------------------- |
| GET    | `/`                     | No          | Welcome message                         |
| GET    | `/api/health`           | No          | Server and database status              |
| GET    | `/api/events`           | No          | Get events (search, filter, pagination) |
| GET    | `/api/events/:id`       | No          | Get a single event                      |
| POST   | `/api/events`           | Yes         | Create an event                         |
| PATCH  | `/api/events/:id`       | Yes (owner) | Update an event                         |
| DELETE | `/api/events/:id`       | Yes (owner) | Delete an event                         |
| POST   | `/api/events/:id/join`  | Yes         | Join an event                           |
| DELETE | `/api/events/:id/leave` | Yes         | Leave an event                          |
| GET    | `/api/my/events`        | Yes         | Get events created by the user          |
| GET    | `/api/my/joined-events` | Yes         | Get events the user has joined          |

### Query Parameters for `GET /api/events`

| Parameter  | Default | Description                                                |
| ---------- | ------- | ---------------------------------------------------------- |
| `search`   | –       | Case-insensitive match on title, description, or location  |
| `category` | –       | Filter by category (`All` or empty returns every category) |
| `page`     | `1`     | Page number                                                |
| `limit`    | `9`     | Items per page (maximum `50`)                              |

Example:

```text
GET /api/events?search=winter&category=Clothing&page=1&limit=9
```

Response:

```json
{
  "success": true,
  "total": 24,
  "page": 1,
  "limit": 9,
  "totalPages": 3,
  "events": []
}
```

---

## 📝 Create / Update Event

`POST /api/events` and `PATCH /api/events/:id` accept the same JSON body. Note that `PATCH` is validated as a full update, so send every required field.

```json
{
  "title": "Winter Clothes Distribution",
  "description": "Distributing warm clothes to families in need.",
  "category": "Clothing",
  "location": "Dhaka",
  "eventDate": "2026-12-20",
  "startTime": "09:00",
  "endTime": "13:00",
  "volunteersNeeded": 25,
  "imageUrl": "https://example.com/image.jpg"
}
```

### Validation Rules

| Field                   | Rule                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `title`                 | Required, at least 5 characters                                                        |
| `description`           | Required, at least 20 characters                                                       |
| `category`              | One of: `Education`, `Environment`, `Food`, `Health`, `Clothing`, `Community`, `Other` |
| `location`              | Required, at least 3 characters                                                        |
| `eventDate`             | Format `YYYY-MM-DD`, today or later (checked in Asia/Dhaka time)                       |
| `volunteersNeeded`      | Integer from 1 to 10000                                                                |
| `startTime` / `endTime` | Optional; if both are given, end time must be after start time                         |
| `imageUrl`              | Optional; must be a valid HTTP or HTTPS URL                                            |

---

## 🗄️ Database

- **Database:** `impactpulse`
- **Collection:** `events`

### Event Document

```json
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "category": "string",
  "location": "string",
  "eventDate": "YYYY-MM-DD",
  "startTime": "string",
  "endTime": "string",
  "volunteersNeeded": 25,
  "imageUrl": "string",
  "createdBy": "user id",
  "createdByName": "string",
  "createdByEmail": "string",
  "participants": [
    { "userId": "string", "name": "string", "joinedAt": "Date" }
  ],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

API responses also include `eventId` and `participantCount` for convenience.

### Indexes

- `eventDate`
- `category`
- `createdBy`
- `participants.userId`

---

## ⚠️ Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Description of what went wrong."
}
```

| Status | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| `400`  | Invalid input, invalid event ID, event already passed, or event is full |
| `401`  | Not logged in or session expired                                        |
| `403`  | Not the owner of the event                                              |
| `404`  | Event or route not found                                                |
| `409`  | User already joined the event                                           |
| `503`  | Session verification service unavailable                                |
| `500`  | Internal server error                                                   |

---

## 🌐 CORS

Requests are only accepted from `CLIENT_URL`, with credentials enabled. Allowed methods are `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS`. The request body size limit is 2 MB.

---

## 🚀 Future Improvements

- Volunteer attendance tracking
- Admin moderation endpoints
- Event notifications and reminders
- Event reviews and feedback
- Rate limiting and request logging

---

## 📄 License

This project is developed for educational and community development purposes.

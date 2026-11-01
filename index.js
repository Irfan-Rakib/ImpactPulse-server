import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";
import cors from "cors";
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
connectToMongoDB();

app.get("/", (req, res) => {
  res.send("Hello World from impactpulse-server");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import cors from "cors";
import "dotenv/config";
import express from "express";
import admin from "firebase-admin";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.port || 3000;
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("EcoTrack API running...");
});

const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  try {
    const decode = await admin.auth().verifyIdToken(token);
    req.token_email = decode.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized" });
  }
};

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@projects.khlwhkd.mongodb.net/?appName=projects`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const ecotackDB = client.db("ecotack");
    const challengesCol = ecotackDB.collection("challenges");
    const userChallengesCol = ecotackDB.collection("userChallenges");
    const statsCol = ecotackDB.collection("stats");
    const tipsCol = ecotackDB.collection("tips");
    const eventsCol = ecotackDB.collection("events");
    const usersCol = ecotackDB.collection("users");

    // ------------------ USER ROUTES ------------------

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCol.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCol.insertOne(user);
      res.send(result);
    });

    // ------------------ CHALLENGE ROUTES ------------------

    app.get("/challenges", async (req, res) => {
      try {
        const {
          categories,
          startDate,
          endDate,
          minParticipants,
          maxParticipants,
        } = req.query;

        const filter = {};

        if (categories) {
          const categoryArray = categories.split(",");
          filter.category = { $in: categoryArray };
        }

        if (startDate || endDate) {
          filter.startDate = {};
          if (startDate) filter.startDate.$gte = startDate;
          if (endDate) filter.startDate.$lte = endDate;
        }

        if (minParticipants || maxParticipants) {
          filter.participants = {};
          if (minParticipants)
            filter.participants.$gte = parseInt(minParticipants);
          if (maxParticipants)
            filter.participants.$lte = parseInt(maxParticipants);
        }

        const result = await challengesCol.find(filter).toArray();
        res.send(result);
      } catch (err) {
        // console.error("Error fetching challenges:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/challenges/sort", async (req, res) => {
      const cursor = challengesCol.find().limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/challenges/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const challengeObjectId = new ObjectId(id);

        const result = await challengesCol
          .aggregate([
            { $match: { _id: challengeObjectId } },
            {
              $lookup: {
                from: "userChallenges",
                localField: "_id",
                foreignField: "challengeId",
                as: "joiners",
              },
            },
            {
              $addFields: {
                participants: { $size: "$joiners" },
              },
            },
            { $project: { joiners: 0 } },
          ])
          .toArray();

        if (result.length > 0) {
          res.send(result[0]);
        } else {
          res.status(404).send({ message: "Challenge not found" });
        }
      } catch (error) {
        // console.error("Error fetching challenge:", error);
        res.status(400).send({ message: "Invalid Challenge ID format" });
      }
    });

    app.post("/challenges", verifyFirebaseToken, async (req, res) => {
      try {
        const newChallenge = req.body;

        // Add createdBy from token (for tracking)
        newChallenge.createdBy = req.token_email;

        const result = await challengesCol.insertOne(newChallenge);
        res.send(result);
      } catch (error) {
        // console.error("Error adding challenge:", error);
        res.status(500).send({ message: "Failed to add challenge" });
      }
    });

    app.patch("/challenges/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedChallenge = req.body;
      const update = { $set: updatedChallenge };

      const result = await challengesCol.updateOne(query, update);
      res.send(result);
    });

    app.delete("/challenges/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await challengesCol.deleteOne(query);
      res.send(result);
    });

    // ------------------ USER CHALLENGES ------------------

    app.post("/userChallenges", verifyFirebaseToken, async (req, res) => {
      try {
        const { userId, challengeId } = req.body;

        if (!userId || !challengeId) {
          return res
            .status(400)
            .send({ message: "Missing userId or challengeId" });
        }

        if (!ObjectId.isValid(challengeId)) {
          return res
            .status(400)
            .send({ message: "Invalid Challenge ID format" });
        }

        const challengeObjectId = new ObjectId(challengeId);
        const existing = await userChallengesCol.findOne({
          userId,
          challengeId: challengeObjectId,
        });
        if (existing) {
          return res
            .status(400)
            .send({ message: "Already joined this challenge" });
        }

        const newJoin = {
          userId,
          challengeId: challengeObjectId,
          status: "Not Started",
          progress: 0,
          joinDate: new Date(),
        };
        const insertResult = await userChallengesCol.insertOne(newJoin);

        if (insertResult.insertedId) {
          await challengesCol.updateOne(
            { _id: challengeObjectId },
            { $inc: { participants: 1 } }
          );
        }
        res.send(insertResult);
      } catch (err) {
        // console.error("Join challenge error:", err);
        res.status(500).send({ message: err.message });
      }
    });

    app.get("/userChallenges", async (req, res) => {
      const cursor = userChallengesCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/userChallenges/:userId", async (req, res) => {
      const userId = req.params.userId;
      const cursor = userChallengesCol.find({ userId });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/userChallenges/:userId/:challengeId", async (req, res) => {
      const { userId, challengeId } = req.params;
      const { status } = req.body;

      try {
        const challengeObjectId = new ObjectId(challengeId);

        const result = await userChallengesCol.updateOne(
          { userId, challengeId: challengeObjectId },
          { $set: { status } }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Status updated successfully" });
        } else if (result.matchedCount > 0) {
          res
            .status(200)
            .send({ message: "Status unchanged (already set to this value)" });
        } else {
          res
            .status(404)
            .send({ message: "Challenge not found for this user" });
        }
      } catch (error) {
        // console.error("Update error:", error);
        res.status(500).send({ message: "An unexpected error occurred" });
      }
    });

    // ------------------ OTHER ROUTES ------------------

    app.get("/stats", async (req, res) => {
      const cursor = await statsCol.findOne();
      res.send(cursor);
    });

    app.get("/tips", async (req, res) => {
      const cursor = tipsCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/tips/recent", async (req, res) => {
      const cursor = tipsCol.find().sort({ createdAt: -1 }).limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/events", async (req, res) => {
      const cursor = eventsCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/events/upcoming", async (req, res) => {
      const cursor = eventsCol.find().limit(4);
      const result = await cursor.toArray();
      res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`EcoTrack server running on port ${port}`);
});

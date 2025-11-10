import cors from "cors";
import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
const app = express();
const port = process.env.port || 3000; // Use environment variable for port

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri =
  "mongodb+srv://ecotrack:qHPqoeues4mQojXD@projects.khlwhkd.mongodb.net/?appName=projects";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    const ecotackDB = client.db("ecotack");
    const challengesCol = ecotackDB.collection("challenges");
    const userChallengesCol = ecotackDB.collection("userChallenges");

    const statsCol = ecotackDB.collection("stats");
    const tipsCol = ecotackDB.collection("tips");
    const eventsCol = ecotackDB.collection("events");

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // --- CHALLENGE ROUTES ---

    app.get("/challenges", async (req, res) => {
      const cursor = challengesCol.find();
      const result = await cursor.toArray();
      res.send(result);
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
        console.error("Error fetching challenge with participants:", error);
        res.status(400).send({ message: "Invalid Challenge ID format" });
      }
    });

    app.post("/challenges", async (req, res) => {
      const newChallenge = req.body;
      console.log(newChallenge);
      const result = await challengesCol.insertOne(newChallenge);
      res.send(result);
    });

    app.get("/stats", async (req, res) => {
      const cursor = await statsCol.findOne();

      res.send(cursor);
    });

    // user challenges
    app.post("/userChallenges", async (req, res) => {
      try {
        const { userId, challengeId } = req.body;
        console.log(challengeId);
        if (!userId || !challengeId) {
          return res
            .status(400)
            .send({ message: "Missing userId or challengeId" });
        }

        // ✅ Check if it's a valid ObjectId string
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
        if (err.message.includes("Argument passed in must be a string")) {
          return res
            .status(400)
            .send({ message: "Invalid Challenge ID format" });
        }
        console.error("Join challenge error:", err);
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
        if (error.message.includes("Argument passed in must be a string")) {
          return res
            .status(400)
            .send({ message: "Invalid Challenge ID format" });
        }
        console.error("Update error:", error);
        res.status(500).send({ message: "An unexpected error occurred" });
      }
    });

    app.get("/tips", async (req, res) => {
      const cursor = tipsCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/tips/recent", async (req, res) => {
      const cursor = tipsCol.find().sort({
        createdAt: -1,
      }).limit(5);
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
  console.log(`Example app listening on port ${port}`);
});

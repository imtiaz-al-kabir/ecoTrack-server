import cors from "cors";
import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
const app = express();
const port = process.env.port || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri =
  "mongodb+srv://ecotrack:qHPqoeues4mQojXD@projects.khlwhkd.mongodb.net/?appName=projects";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const ecotackDB = client.db("ecotack");
    const challengesCol = ecotackDB.collection("challenges");
    // Send a ping to confirm a successful connection
    app.get("/challenges", async (req, res) => {
      const cursor = challengesCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/challenges", async (req, res) => {
      const cursor = challengesCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

//qHPqoeues4mQojXD

//ecotrack

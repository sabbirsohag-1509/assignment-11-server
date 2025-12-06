const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-adminsdk.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware
app.use(cors());
app.use(express.json());

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.decodedEmail = decodedToken.email;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

app.get("/", (req, res) => {
  res.send("ScholarStream Server is running");
});

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASS}@mycluster.eyaxb6h.mongodb.net/?appName=myCluster`;

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

    const myDB = client.db("scholarStreamDB");
    const scholarshipsCollection = myDB.collection("scholarships");

    // Scholarship related API
    //post
    app.post("/scholarships", async (req, res) => {
      const formDataInfo = req.body;
      formDataInfo.scholarshipPostDate = new Date();
      const result = await scholarshipsCollection.insertOne(formDataInfo);
      res.send(result);
    });
    //get
    app.get("/scholarships", verifyFirebaseToken, async (req, res) => {
      const result = await scholarshipsCollection
        .find()
        .sort({ scholarshipPostDate: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get("/all-scholarships", verifyFirebaseToken, async (req, res) => {
      const result = await scholarshipsCollection
        .find()
        .sort({ scholarshipPostDate: -1 })
        .toArray();
      res.send(result);
    });
    //findOne
    app.get("/scholarships/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipsCollection.findOne(query);
      res.send(result);
    });
    //update
    app.patch("/scholarships/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const formData = req.body;
      // console.log(formData);
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: formData,
      };
      const result = await scholarshipsCollection.updateOne(query, update);
      res.send(result);
    });
    //delete
    app.delete("/scholarships/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipsCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

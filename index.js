const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const applicationsCollection = myDB.collection("applications");
    const reviewsCollection = myDB.collection("reviews");
    const usersCollection = myDB.collection("users");

    //============================Middleware to verify admin role================================
    const verifyAdmin = async (req, res, next) => { 
      const email = req.decodedEmail;
      // const query = { email: email };
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    }

    //===========================Middleware to Verify Moderator role========================
    const verifyModerator = async (req, res, next) => {
      const email = req.decodedEmail;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Moderator") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };



    //============================ Users related API =======================================
    //post user info
    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      user.role = "Student";
      user.registrationDate = new Date();
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //get user info
    app.get("/users", verifyFirebaseToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //get single user info by email
    app.get("/users/:email/role", verifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ role: "Student" });
      res.send({ role: user.role });
    });

    // Update user role
    app.patch("/users/:id/role", verifyFirebaseToken,verifyAdmin, async (req, res) => {
      const userId = req.params.id;
      const { role } = req.body;

      if (!role) {
        return res.status(400).send({ message: "Role is required" });
      }

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } }
        );

        if (result.modifiedCount === 1) {
          res.send({ message: "User role updated successfully" });
        } else {
          res.status(404).send({ message: "User not found or role unchanged" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Delete user
    app.delete("/users/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const userId = req.params.id;

      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(userId),
        });

        if (result.deletedCount === 1) {
          res.send({ message: "User deleted successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //============================ Review related API ======================================
    //post
    app.post("/reviews", async (req, res) => {
      const reviewData = req.body;
      reviewData.reviewDate = new Date();
      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });
    //get
    app.get("/reviews", async (req, res) => {
      const { scholarshipId } = req.query;
      const reviews = await reviewsCollection
        .find({ scholarshipId })
        .sort({ reviewDate: -1 })
        .toArray();
      res.json(reviews);
    });
    //get by user email
    app.get("/user-reviews", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await reviewsCollection
        .find(query)
        .sort({ reviewDate: -1 })
        .toArray();
      res.send(result);
    });
    //delete
    app.delete("/reviews/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });
    //update
    app.patch("/reviews/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          reviewComment: updatedData.reviewComment,
          ratingPoint: updatedData.ratingPoint,
          reviewDate: new Date(),
        },
      };
      const result = await reviewsCollection.updateOne(query, update);
      res.send(result);
    });
    //all reviews
    app.get("/all-reviews", verifyFirebaseToken, async (req, res) => {
      const result = await reviewsCollection
        .find()
        .sort({ reviewDate: -1 })
        .toArray();
      res.send(result);
    });

    //============================ Scholarship related API ==================================
    //post
    app.post("/scholarships",verifyFirebaseToken,verifyAdmin, async (req, res) => {
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
    app.patch("/scholarships/:id", verifyFirebaseToken,verifyAdmin, async (req, res) => {
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

    //============================ Application related API ====================================
    //post
    app.post("/applications", async (req, res) => {
      const applicationData = req.body;
      applicationData.applicationStatus = "pending";
      applicationData.applicationDate = new Date();
      applicationData.paymentStatus = "unpaid";
      applicationData.feedback = "";
      const result = await applicationsCollection.insertOne(applicationData);
      res.send(result);
    });
    //get by user email
    app.get("/applications", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.query.email;
      const query = { userEmail: userEmail };
      const result = await applicationsCollection
        .find(query)
        .sort({ applicationDate: -1 })
        .toArray();
      res.send(result);
    });
    //get all applications
    app.get("/all-applications", verifyFirebaseToken, async (req, res) => {
      const result = await applicationsCollection.find().toArray();
      res.send(result);
    });

    //delete
    app.delete("/applications/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });
    // Get single application by id
    app.get("/applications/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;

      try {
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!application) {
          return res.status(404).send({ message: "Application not found" });
        }

        res.send(application);
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });
    //patch for application phone & address
    app.patch("/applications/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          phone: updatedData.phone,
          address: updatedData.address,
        },
      };
      const result = await applicationsCollection.updateOne(query, update);
      res.send(result);
    });
    //patch application by MODERATOR
    app.patch(
      "/applications/moderator/:id",
      verifyFirebaseToken,
      verifyModerator,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };

        const update = {
          $set: {
            ...(updatedData.applicationStatus && {
              applicationStatus: updatedData.applicationStatus,
            }),
            ...(updatedData.feedback && { feedback: updatedData.feedback }),
          },
        };

        const result = await applicationsCollection.updateOne(query, update);
        res.send(result);
      }
    );

    //=================================PAYMENT==================================================
    //Payments Related API
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      // console.log(paymentInfo);

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentInfo?.universityName,
                description: paymentInfo?.scholarshipName,
              },

              unit_amount: paymentInfo?.applicationFees * 100,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo?.userEmail,
        metadata: {
          applicationId: paymentInfo?.applicationId,
          userEmail: paymentInfo?.userEmail,
          userName: paymentInfo?.userName,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}&applicationId=${paymentInfo.applicationId}`,

        cancel_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-cancelled?applicationId=${paymentInfo.applicationId}&error=Payment+was+declined`,
      });
      res.send({ url: session.url });
    });

    //patch for payment success
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log("Stripe session:", session);

      if (session.payment_status === "paid") {
        const applicationId = session.metadata.applicationId;
        // console.log("Application ID:", applicationId);

        const query = { _id: new ObjectId(applicationId) };
        const update = {
          $set: {
            paymentStatus: "paid",
          },
        };

        const result = await applicationsCollection.updateOne(query, update);

        return res.send({
          success: true,
          application: result,
          modifiedCount: result.modifiedCount,
        });
      }
      res.send({ success: false, message: "Payment not completed" });
    });
    //================================= End of PAYMENT ==========================================

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

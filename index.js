const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-adminsdk.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//middleware 
app.use (cors());
app.use(express.json());

const verifyFirebaseToken = async(req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({message: 'Unauthorized access'});
    }

    try { 
        const idToken = token.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.decodedEmail = decodedToken.email;

        next();
    }
    catch (error) {
        return res.status(401).send({message: 'Unauthorized access'});
    }
}


app.get('/', (req, res) => {
    res.send('Hello World! This is Assignment-11 Server');
});

// here we can add more routes and use the verifyFirebaseToken middleware where needed








app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
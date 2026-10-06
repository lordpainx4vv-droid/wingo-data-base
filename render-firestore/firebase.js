const admin = require("firebase-admin");
const path = require("path");

// Render-এর Secret Files পাথ অথবা লোকাল পাথ হ্যান্ডেল করার জন্য
const serviceAccountPath = process.env.RENDER 
  ? path.join("/etc/secrets", "serviceAccountKey.json") 
  : "./serviceAccountKey.json";

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;

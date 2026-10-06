const admin = require("firebase-admin");

let serviceAccount;

try {
  if (process.env.FIREBASE_CONFIG_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
  } else {
    serviceAccount = require("./serviceAccountKey.json");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error.message);
}

const db = admin.firestore();

module.exports = db;

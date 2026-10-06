const admin = require("firebase-admin");

let serviceAccount;

try {
  if (process.env.FIREBASE_CONFIG_JSON) {
    // এনভায়রনমেন্ট ভ্যারিয়েবল থেকে জেসন রিড করা
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
  } else {
    // লোকাল পিসির জন্য
    serviceAccount = require("./serviceAccountKey.json");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error("Firebase Initialization Error:", error.message);
}

const db = admin.firestore();

module.exports = db;

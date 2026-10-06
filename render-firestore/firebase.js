const admin = require("firebase-admin");

let serviceAccount;

if (process.env.FIREBASE_CONFIG_JSON) {
  // যদি Render এনভায়রনমেন্ট ভ্যারিয়েবল থেকে দেয়
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
} else {
  // যদি লোকাল কম্পিউটারে থাকেন
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;

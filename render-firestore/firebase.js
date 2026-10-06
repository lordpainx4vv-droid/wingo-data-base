const {
  initializeApp,
  cert
} = require("firebase-admin/app");

const {
  getFirestore
} = require("firebase-admin/firestore");

// লোকাল ফাইল থেকে সরাসরি সার্ভিস একাউন্ট কি লোড করা হচ্ছে
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

module.exports = db;

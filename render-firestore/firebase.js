const {
  initializeApp,
  cert
} = require("firebase-admin/app");

const {
  getFirestore
} = require("firebase-admin/firestore");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT environment variable is missing"
  );
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );
} catch (error) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT contains invalid JSON"
  );
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

module.exports = db;

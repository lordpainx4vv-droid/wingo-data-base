const express = require('express');
const axios = require('axios');
const db = require('./firebase'); // firebase.js থেকে db ইমপোর্ট করা হচ্ছে

const app = express();
app.use(express.json());

// এনভায়রনমেন্ট ভ্যারিয়েবল থেকে ভ্যালু নেওয়া
const SOURCE_API_URL = process.env.SOURCE_API_URL || "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";
const COLLECTION_NAME = process.env.FIRESTORE_COLLECTION || "results";

// রুট রাউট (সার্ভার স্ট্যাটাস চেক করার জন্য)
app.get('/', (req, res) => {
  res.json({
    status: "online",
    service: "Vercel Auto Proxy Collector",
    firestore: db ? "connected" : "disconnected",
    time: new Date().toISOString()
  });
});

// ডেটা ফেচ করে ফায়ারস্টোরে সেভ করার ফাংশন
async function fetchAndSaveData() {
  try {
    // Render/Vercel আইপি ব্লক এড়াতে allorigins প্রক্সি ব্যবহার করা
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(SOURCE_API_URL)}`;
    const response = await axios.get(proxyUrl);
    
    // allorigins ডেটাকে contents এর ভেতর string আকারে দেয়, তাই সেটি JSON.parse করতে হবে
    const data = JSON.parse(response.data.contents);

    // ডেটা থেকে রেজल्ट লিস্ট বের করে ফায়ারস্টোরে সেভ করা
    // (আপনার API-এর স্ট্রাকচার অনুযায়ী data.data.list বা সরাসরি data হতে পারে)
    const records = data.data?.list || data.list || data;

    if (Array.isArray(records) && records.length > 0) {
      const batch = db.batch();
      
      records.forEach((item) => {
        // issueNumber বা unique id দিয়ে doc reference তৈরি
        const docRef = db.collection(COLLECTION_NAME).doc(String(item.issueNumber || item.period || Date.now()));
        batch.set(docRef, { ...item, savedAt: new Date().toISOString() }, { merge: true });
      });

      await batch.commit();
      console.log(`Successfully saved ${records.length} items to Firestore.`);
    }
  } catch (error) {
    console.error("Error fetching or saving data:", error.message);
  }
}

// API endpoint যার মাধ্যমে ম্যানুয়ালি বা ক্রন জব দিয়ে ডেটা কালেক্ট ট্রিগার করা যাবে
app.get('/api/collect', async (req, res) => {
  await fetchAndSaveData();
  res.json({ success: true, message: "Collection triggered successfully!" });
});

// ফায়ারস্টোর থেকে ডেটা দেখার জন্য API endpoint
app.get('/api/results', async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTION_NAME).orderBy('savedAt', 'desc').limit(20).get();
    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, data: results });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// লোকাল পিসিতে টেস্ট করার জন্য port listen
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

// Vercel-এর জন্য এক্সপোর্ট
module.exports = app;

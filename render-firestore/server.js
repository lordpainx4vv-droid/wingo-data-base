const express = require("express");
const db = require("./firebase");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ============================================
// CONFIG
// ============================================

const SOURCE_API_URL = process.env.SOURCE_API_URL;
const POLL_INTERVAL = 31 * 1000; // ৩১ সেকেন্ড পর পর অটো ফেচ হবে

const COLLECTION_NAME =
  process.env.FIRESTORE_COLLECTION || "results";

const DEFAULT_LIMIT = 100;

if (!SOURCE_API_URL) {
  console.warn("WARNING: SOURCE_API_URL is not configured.");
}


// ============================================
// AUTO FETCH USING FREE PROXY (Bypassing 403)
// ============================================

async function fetchSourceData() {
  if (!SOURCE_API_URL) {
    throw new Error("SOURCE_API_URL is not configured");
  }

  // ক্লাউড আইপি ব্লক এড়ানোর জন্য আমরা ফ্রি পাবলিক প্রক্সি রুট ব্যবহার করছি
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(SOURCE_API_URL)}`;

  const response = await fetch(proxyUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) {
    throw new Error(`Source API returned HTTP ${response.status}`);
  }

  return await response.json();
}


// ============================================
// NORMALIZE SOURCE DATA
// ============================================

function extractList(apiData) {
  if (Array.isArray(apiData)) {
    return apiData;
  }
  if (apiData && apiData.data && Array.isArray(apiData.data.list)) {
    return apiData.data.list;
  }
  if (apiData && Array.isArray(apiData.list)) {
    return apiData.list;
  }
  return [];
}


// ============================================
// SAVE ONE RESULT (Transaction for Duplicates)
// ============================================

async function saveResult(item) {
  if (!item || typeof item !== "object") {
    return { saved: false, reason: "invalid_item" };
  }

  const issueNumber =
    item.issueNumber ??
    item.issue ??
    item.period ??
    item.periodNumber ??
    item.id;

  if (issueNumber === undefined || issueNumber === null || String(issueNumber).trim() === "") {
    return { saved: false, reason: "missing_issue_number" };
  }

  const issue = String(issueNumber).trim();
  const docRef = db.collection(COLLECTION_NAME).doc(issue);

  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(docRef);

    if (existing.exists) {
      return { saved: false, duplicate: true, issueNumber: issue };
    }

    const dataToSave = {
      ...item,
      issueNumber: issue,
      savedAt: new Date().toISOString(),
      serverTimestamp: new Date().getTime()
    };

    transaction.create(docRef, dataToSave);

    return { saved: true, duplicate: false, issueNumber: issue };
  });

  return result;
}


// ============================================
// AUTOMATIC BACKGROUND COLLECTOR LOOP
// ============================================

let collecting = false;

async function collectData() {
  if (collecting) {
    console.log("Previous collection is still running. Skipping.");
    return;
  }

  collecting = true;

  try {
    console.log(`[${new Date().toISOString()}] Automatically checking source API via Proxy...`);

    const apiData = await fetchSourceData();
    const list = extractList(apiData);

    if (!list.length) {
      console.log("No result list found from API.");
      return;
    }

    let savedCount = 0;
    let duplicateCount = 0;

    for (const item of list) {
      try {
        const result = await saveResult(item);
        if (result.saved) {
          savedCount++;
          console.log(`NEW SAVED: ${result.issueNumber}`);
        } else if (result.duplicate) {
          duplicateCount++;
        }
      } catch (error) {
        console.error("Save error:", error.message);
      }
    }

    console.log(
      `Auto Collection finished | Received=${list.length} | Saved=${savedCount} | Duplicates=${duplicateCount}`
    );

  } catch (error) {
    console.error("Auto Collector error:", error.message);
  } finally {
    collecting = false;
  }
}

function startCollector() {
  console.log(`Automatic Background Collector started. Interval: ${POLL_INTERVAL}ms`);
  
  collectData();
  setInterval(collectData, POLL_INTERVAL);
}


// ============================================
// EXPRESS ROUTES
// ============================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Render Auto Proxy Collector",
    collectorInterval: "31 seconds",
    firestore: "connected",
    time: new Date().toISOString()
  });
});

app.get("/collect", async (req, res) => {
  await collectData();
  res.json({
    success: true,
    message: "Manual trigger executed",
    time: new Date().toISOString()
  });
});

app.get("/api/results", async (req, res) => {
  try {
    let limit = parseInt(req.query.limit || DEFAULT_LIMIT, 10);
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > 500) limit = 500;

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .orderBy("serverTimestamp", "desc")
      .limit(limit)
      .get();

    const results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/latest", async (req, res) => {
  try {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .orderBy("serverTimestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, result: null });
    }

    const doc = snapshot.docs[0];
    res.json({ success: true, result: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});


// ============================================
// SERVER START & AUTO COLLECTOR TRIGGER
// ============================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCollector();
});

const express = require("express");
const db = require("./firebase");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ============================================
// CONFIG
// ============================================

const SOURCE_API_URL = process.env.SOURCE_API_URL;

const POLL_INTERVAL = 31 * 1000;

// Firestore collection
const COLLECTION_NAME =
  process.env.FIRESTORE_COLLECTION || "results";

// How many results API returns
const DEFAULT_LIMIT = 100;


// ============================================
// BASIC CHECK
// ============================================

if (!SOURCE_API_URL) {
  console.warn(
    "WARNING: SOURCE_API_URL is not configured."
  );
}


// ============================================
// FETCH SOURCE API
// ============================================

async function fetchSourceData() {

  if (!SOURCE_API_URL) {
    throw new Error(
      "SOURCE_API_URL is not configured"
    );
  }

  const response = await fetch(SOURCE_API_URL, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "Render-Firestore-Collector/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source API returned HTTP ${response.status}`
    );
  }

  return await response.json();
}


// ============================================
// NORMALIZE SOURCE DATA
// ============================================
//
// Supports:
// {
//   data: {
//     list: [...]
//   }
// }
//
// OR
//
// {
//   list: [...]
// }
//
// OR
//
// [
//   {...}
// ]
//

function extractList(apiData) {

  if (Array.isArray(apiData)) {
    return apiData;
  }

  if (
    apiData &&
    apiData.data &&
    Array.isArray(apiData.data.list)
  ) {
    return apiData.data.list;
  }

  if (
    apiData &&
    Array.isArray(apiData.list)
  ) {
    return apiData.list;
  }

  return [];
}


// ============================================
// SAVE ONE RESULT
// ============================================

async function saveResult(item) {

  if (!item || typeof item !== "object") {
    return {
      saved: false,
      reason: "invalid_item"
    };
  }

  // ------------------------------------------
  // Detect issue number
  // ------------------------------------------

  const issueNumber =
    item.issueNumber ??
    item.issue ??
    item.period ??
    item.periodNumber ??
    item.id;

  if (
    issueNumber === undefined ||
    issueNumber === null ||
    String(issueNumber).trim() === ""
  ) {
    return {
      saved: false,
      reason: "missing_issue_number"
    };
  }

  const issue = String(issueNumber).trim();

  // ------------------------------------------
  // IMPORTANT:
  // issueNumber itself is Firestore document ID
  // ------------------------------------------

  const docRef = db
    .collection(COLLECTION_NAME)
    .doc(issue);

  // ------------------------------------------
  // Transaction:
  // prevents duplicate creation
  // ------------------------------------------

  const result = await db.runTransaction(
    async (transaction) => {

      const existing =
        await transaction.get(docRef);

      if (existing.exists) {
        return {
          saved: false,
          duplicate: true,
          issueNumber: issue
        };
      }

      const dataToSave = {
        ...item,

        issueNumber: issue,

        savedAt:
          new Date().toISOString(),

        serverTimestamp:
          new Date().getTime()
      };

      transaction.create(
        docRef,
        dataToSave
      );

      return {
        saved: true,
        duplicate: false,
        issueNumber: issue
      };
    }
  );

  return result;
}


// ============================================
// COLLECT DATA
// ============================================

let collecting = false;

async function collectData() {

  if (collecting) {
    console.log(
      "Previous collection is still running. Skipping."
    );

    return;
  }

  collecting = true;

  try {

    console.log(
      `[${new Date().toISOString()}] Checking source API...`
    );

    const apiData =
      await fetchSourceData();

    const list =
      extractList(apiData);

    if (!list.length) {

      console.log(
        "No result list found."
      );

      return;
    }

    let savedCount = 0;
    let duplicateCount = 0;

    // ----------------------------------------
    // Save every item
    // ----------------------------------------

    for (const item of list) {

      try {

        const result =
          await saveResult(item);

        if (result.saved) {

          savedCount++;

          console.log(
            `NEW: ${result.issueNumber}`
          );

        } else if (result.duplicate) {

          duplicateCount++;

        }

      } catch (error) {

        console.error(
          "Save error:",
          error.message
        );
      }
    }

    console.log(
      `Collection finished | ` +
      `received=${list.length} ` +
      `saved=${savedCount} ` +
      `duplicates=${duplicateCount}`
    );

  } catch (error) {

    console.error(
      "Collector error:",
      error.message
    );

  } finally {

    collecting = false;
  }
}


// ============================================
// START COLLECTOR
// ============================================

function startCollector() {

  console.log(
    `Collector started. Interval: ${POLL_INTERVAL}ms`
  );

  // Immediately run once
  collectData();

  // Then every 31 seconds
  setInterval(
    collectData,
    POLL_INTERVAL
  );
}


// ============================================
// HEALTH API
// ============================================

app.get("/", (req, res) => {

  res.json({
    status: "online",
    service: "Render Firestore Collector",
    collectorInterval: "31 seconds",
    firestore: "connected",
    time: new Date().toISOString()
  });

});


// ============================================
// MANUAL COLLECT
// ============================================

app.get("/collect", async (req, res) => {

  await collectData();

  res.json({
    success: true,
    message: "Collection triggered",
    time: new Date().toISOString()
  });

});


// ============================================
// GET ALL RESULTS
// ============================================

app.get("/api/results", async (req, res) => {

  try {

    let limit =
      parseInt(
        req.query.limit || DEFAULT_LIMIT,
        10
      );

    if (
      Number.isNaN(limit) ||
      limit < 1
    ) {
      limit = DEFAULT_LIMIT;
    }

    if (limit > 500) {
      limit = 500;
    }

    const snapshot =
      await db
        .collection(COLLECTION_NAME)
        .orderBy(
          "serverTimestamp",
          "desc"
        )
        .limit(limit)
        .get();

    const results =
      snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    res.json({
      success: true,
      count: results.length,
      results
    });

  } catch (error) {

    console.error(
      "History error:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message
    });
  }

});


// ============================================
// GET LATEST RESULT
// ============================================

app.get("/api/latest", async (req, res) => {

  try {

    const snapshot =
      await db
        .collection(COLLECTION_NAME)
        .orderBy(
          "serverTimestamp",
          "desc"
        )
        .limit(1)
        .get();

    if (snapshot.empty) {

      return res.json({
        success: true,
        result: null
      });

    }

    const doc =
      snapshot.docs[0];

    res.json({
      success: true,
      result: {
        id: doc.id,
        ...doc.data()
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


// ============================================
// GET SPECIFIC ISSUE
// ============================================

app.get(
  "/api/results/:issueNumber",
  async (req, res) => {

    try {

      const issue =
        String(
          req.params.issueNumber
        ).trim();

      const doc =
        await db
          .collection(COLLECTION_NAME)
          .doc(issue)
          .get();

      if (!doc.exists) {

        return res.status(404).json({
          success: false,
          message: "Result not found"
        });

      }

      res.json({
        success: true,
        result: {
          id: doc.id,
          ...doc.data()
        }
      });

    } catch (error) {

      res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }
);


// ============================================
// 404
// ============================================

app.use((req, res) => {

  res.status(404).json({
    success: false,
    message: "Endpoint not found"
  });

});


// ============================================
// SERVER START
// ============================================

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

  startCollector();

});

const express = require("express");
const db = require("./firebase");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ============================================
// CONFIG
// ============================================

const COLLECTION_NAME =
  process.env.FIRESTORE_COLLECTION || "results";

const DEFAULT_LIMIT = 100;


// ============================================
// SAVE ONE RESULT (Core Logic)
// ============================================

async function saveResult(item) {

  if (!item || typeof item !== "object") {
    return {
      saved: false,
      reason: "invalid_item"
    };
  }

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

  const docRef = db
    .collection(COLLECTION_NAME)
    .doc(issue);

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
        savedAt: new Date().toISOString(),
        serverTimestamp: new Date().getTime()
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
// HEALTH API
// ============================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Render Firestore Collector (Client-Sync)",
    firestore: "connected",
    time: new Date().toISOString()
  });
});


// ============================================
// RECEIVE DATA FROM FRONTEND (POST ROUTE)
// ============================================

app.post("/api/save-result", async (req, res) => {
  try {
    const item = req.body;
    const result = await saveResult(item);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error("Save error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

    if (Number.isNaN(limit) || limit < 1) {
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
    console.error("History error:", error);
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

    const doc = snapshot.docs[0];

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
});

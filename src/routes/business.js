const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");

// 1. Create a new business
router.post("/", checkAuth, async (req, res) => {
  const { name, config } = req.body;
  const userId = req.user.uid;

  if (!name) {
    return res.status(400).json({ error: "Business name is required" });
  }

  try {
    const businessRef = db.collection("businesses").doc();
    
    // Set business document
    await businessRef.set({
      name,
      ownerId: userId,
      config: config || {}, // Dynamic fields definition
      createdAt: new Date(),
    });

    // Add creator as "owner" in members sub-collection
    await businessRef.collection("members").doc(userId).set({
      userId,
      role: "owner",
      joinedAt: new Date(),
    });

    res.status(201).json({ id: businessRef.id, message: "Business created successfully" });
  } catch (error) {
    console.error("POST /businesses Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// 2. Add a member to a business (Only Owner/Admin)
router.post("/:businessId/members", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { targetUserId, role } = req.body;

  if (!targetUserId || !role) {
    return res.status(400).json({ error: "targetUserId and role are required" });
  }

  try {
    await db
      .collection("businesses")
      .doc(businessId)
      .collection("members")
      .doc(targetUserId)
      .set({
        userId: targetUserId,
        role,
        addedBy: req.user.uid,
        joinedAt: new Date(),
      });

    res.json({ message: `Member added as ${role}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get all businesses user is a member of (or ALL for Super Admin)
router.get("/", checkAuth, async (req, res) => {
  try {
    let snapshot;
    if (req.user.isSuperAdmin) {
      snapshot = await db.collection("businesses").get();
    } else {
      snapshot = await db.collection("businesses").where("ownerId", "==", req.user.uid).get();
    }
    
    const businesses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Get a single business
router.get("/:businessId", checkAuth, checkRole(["owner", "admin", "viewer"]), async (req, res) => {
  const { businessId } = req.params;
  try {
    const doc = await db.collection("businesses").doc(businessId).get();
    if (!doc.exists) return res.status(404).json({ error: "Business not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update business configuration (Dynamic Fields)
router.patch("/:businessId/config", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { config } = req.body;

  try {
    await db.collection("businesses").doc(businessId).update({
      config,
      updatedAt: new Date()
    });
    res.json({ message: "Configuration updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Add a business entry
router.post("/:businessId/entries", checkAuth, checkRole(["owner", "admin", "editor"]), async (req, res) => {
  const { businessId } = req.params;
  const entryData = req.body;

  try {
    const entryRef = db.collection("businesses").doc(businessId).collection("entries").doc();
    await entryRef.set({
      ...entryData,
      createdBy: req.user.uid,
      createdAt: new Date()
    });
    res.status(201).json({ id: entryRef.id, message: "Entry added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get business entries (with filtering)
router.get("/:businessId/entries", checkAuth, checkRole(["owner", "admin", "viewer"]), async (req, res) => {
  const { businessId } = req.params;
  const { startDate, endDate, searchField, searchQuery } = req.query;

  try {
    let query = db.collection("businesses").doc(businessId).collection("entries").orderBy("createdAt", "desc");

    if (startDate) query = query.where("createdAt", ">=", new Date(startDate));
    if (endDate) query = query.where("createdAt", "<=", new Date(endDate));

    const snapshot = await query.get();
    let entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Dynamic Search (In-memory for simplicity with Firestore)
    if (searchField && searchQuery) {
      entries = entries.filter(entry => 
        String(entry[searchField] || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;

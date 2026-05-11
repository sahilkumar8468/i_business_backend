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
      // Super Admin sees everything
      snapshot = await db.collection("businesses").get();
    } else {
      // Regular users only see businesses they own
      snapshot = await db.collection("businesses").where("ownerId", "==", req.user.uid).get();
    }
    
    const businesses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(businesses);
  } catch (error) {
    console.error("GET /businesses Error:", error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;

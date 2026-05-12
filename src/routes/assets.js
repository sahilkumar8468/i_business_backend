const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth } = require("../middleware/auth");

// Get all assets for the current user
router.get("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;
  try {
    const snapshot = await db.collection("assets").where("userId", "==", userId).get();
    const assets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new asset
router.post("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;
  const { name, type, value, description } = req.body;

  try {
    const assetRef = db.collection("assets").doc();
    const assetData = {
      userId,
      name,
      type, // property, vehicle, gold, other
      value: Number(value) || 0,
      description,
      createdAt: new Date()
    };
    await assetRef.set(assetData);
    res.status(201).json({ id: assetRef.id, ...assetData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an asset
router.delete("/:id", checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection("assets").doc(id).delete();
    res.json({ message: "Asset deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

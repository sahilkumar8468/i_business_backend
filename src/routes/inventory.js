const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");

// Create inventory item
router.post("/:businessId", checkAuth, checkRole(["owner","admin","editor"]), async (req, res) => {
  const { businessId } = req.params;
  const data = req.body;
  try {
    const invRef = db.collection("businesses").doc(businessId).collection("inventory").doc();
    await invRef.set({
      ...data,
      status: data.status || "in_stock",
      createdAt: new Date(),
      createdBy: req.user.uid
    });
    res.status(201).json({ id: invRef.id, message: "Inventory item created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List inventory (with optional status filter)
router.get("/:businessId", checkAuth, checkRole(["owner","admin","viewer","employee"]), async (req, res) => {
  const { businessId } = req.params;
  const { status } = req.query;
  try {
    let query = db.collection("businesses").doc(businessId).collection("inventory").orderBy("createdAt","desc");
    if (status) query = query.where("status","==", status);
    const snap = await query.get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single inventory item
router.get("/:businessId/:itemId", checkAuth, checkRole(["owner","admin","viewer","employee"]), async (req, res) => {
  const { businessId, itemId } = req.params;
  try {
    const doc = await db.collection("businesses").doc(businessId).collection("inventory").doc(itemId).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update inventory item
router.patch("/:businessId/:itemId", checkAuth, checkRole(["owner","admin","editor"]), async (req, res) => {
  const { businessId, itemId } = req.params;
  try {
    await db.collection("businesses").doc(businessId).collection("inventory").doc(itemId).update({ ...req.body, updatedAt: new Date(), updatedBy: req.user.uid });
    res.json({ message: "Inventory updated" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete inventory item
router.delete("/:businessId/:itemId", checkAuth, checkRole(["owner","admin"]), async (req, res) => {
  const { businessId, itemId } = req.params;
  try {
    await db.collection("businesses").doc(businessId).collection("inventory").doc(itemId).delete();
    res.json({ message: "Inventory deleted" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;

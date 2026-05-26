const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");
const { notifyAdmin } = require("../utils/notifyAdmin");

// Create a purchase (company or local)
router.post("/:businessId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const data = req.body;

  try {
    const actorName = req.user.displayName || req.user.email || "Employee";
    const purchaseRef = db.collection("businesses").doc(businessId).collection("purchases").doc();
    await purchaseRef.set({
      ...data,
      createdBy: req.user.uid,
      createdByName: actorName,
      createdAt: new Date()
    });

    // Notify parent admin
    db.collection("businesses").doc(businessId).get().then(bizDoc => {
      const businessName = bizDoc.exists ? bizDoc.data().name : "Business";
      notifyAdmin({
        actorUid: req.user.uid,
        actorName,
        type: "purchase_added",
        message: `recorded a purchase of ${data.model || "item"} in "${businessName}"`,
        businessId,
        businessName,
        refId: purchaseRef.id
      });
    }).catch(err => console.error("Notification trigger error:", err));

    // Optionally add inventory record if bike is new to stock
    if (data.addToInventory) {
      const invRef = db.collection("businesses").doc(businessId).collection("inventory").doc();
      await invRef.set({
        purchaseId: purchaseRef.id,
        model: data.model,
        vin: data.vin || null,
        purchasePrice: data.price || 0,
        odometerAtPurchase: data.odometer || 0,
        status: "in_stock",
        createdAt: new Date()
      });
    }

    res.status(201).json({ id: purchaseRef.id, message: "Purchase recorded" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List purchases with optional filters
router.get("/:businessId", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const { type, startDate, endDate } = req.query;

  try {
    let query = db.collection("businesses").doc(businessId).collection("purchases").orderBy("createdAt", "desc");
    if (type) query = query.where("type", "==", type);
    if (startDate) query = query.where("createdAt", ">=", new Date(startDate));
    if (endDate) query = query.where("createdAt", "<=", new Date(endDate));

    const snapshot = await query.get();
    const purchases = snapshot.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt }));
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");
const { notifyAdmin } = require("../utils/notifyAdmin");

// Create a sale record and mark inventory item sold
router.post("/:businessId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const data = req.body;

  try {
    const actorName = req.user.displayName || req.user.email || "Employee";
    const saleRef = db.collection("businesses").doc(businessId).collection("sales").doc();
    await saleRef.set({
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
        type: "sale_recorded",
        message: `recorded a sale of ${data.model || "item"} for ${data.price || 0} in "${businessName}"`,
        businessId,
        businessName,
        refId: saleRef.id
      });
    }).catch(err => console.error("Notification trigger error:", err));

    // If inventoryId provided, update inventory status
    if (data.inventoryId) {
      const invRef = db.collection("businesses").doc(businessId).collection("inventory").doc(data.inventoryId);
      await invRef.update({ status: "sold", soldAt: new Date(), soldPrice: data.price || 0, soldTo: data.customer || null });
    }

    res.status(201).json({ id: saleRef.id, message: "Sale recorded" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List sales
router.get("/:businessId", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  try {
    const snap = await db.collection("businesses").doc(businessId).collection("sales").orderBy("createdAt", "desc").get();
    const sales = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt }));
    res.json(sales);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;

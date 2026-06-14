const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");
const { notifyAdmin } = require("../utils/notifyAdmin");

const formatDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBikePurchase = (data) => {
  const finalAmount = toNumber(data.finalAmount ?? data.price ?? data.purchasePrice, 0);
  const initialDeposit = toNumber(data.initialDeposit ?? data.depositAmount, 0);
  return {
    type: data.type === "local" ? "local" : "company",
    showroomName: data.showroomName || "",
    bikeName: data.bikeName || data.model || "",
    model: data.model || data.bikeName || "",
    chassisNo: data.chassisNo || data.vin || "",
    vin: data.vin || data.chassisNo || "",
    engineNo: data.engineNo || "",
    registrationNo: data.registrationNo || "",
    horsePower: data.horsePower || data.hoursePower || "",
    color: data.color || "",
    modelYear: data.modelYear || "",
    odometer: toNumber(data.odometer, 0),
    purchasePersonName: data.purchasePersonName || data.customerName || "",
    purchaseCnicNo: data.purchaseCnicNo || data.purchaseCnic || data.customerCnic || "",
    purchaseRelativeName: data.purchaseRelativeName || data.relativeName || "",
    purchaseAddress: data.purchaseAddress || data.address || "",
    purchaserMobileNo: data.purchaserMobileNo || data.customerPhone || data.mobileNo || "",
    sellerName: data.sellerName || data.purchasePersonName || data.customerName || "",
    sellerCnicNo: data.sellerCnicNo || data.purchaseCnicNo || data.customerCnic || "",
    sellerAddress: data.sellerAddress || data.purchaseAddress || "",
    sellerRelativeName: data.sellerRelativeName || data.purchaseRelativeName || "",
    initialDeposit,
    finalAmount,
    remainingAmount: toNumber(data.remainingAmount, Math.max(0, finalAmount - initialDeposit)),
    price: finalAmount,
    customerName: data.customerName || data.purchasePersonName || "",
    customerPhone: data.customerPhone || data.purchaserMobileNo || "",
    customerCnic: data.customerCnic || data.purchaseCnicNo || "",
    customerPic: data.customerPic || null,
    customerCnicPic: data.customerCnicPic || null,
    addToInventory: data.addToInventory !== false
  };
};

// Create a purchase (company or local)
router.post("/:businessId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const data = normalizeBikePurchase(req.body);

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
        message: `recorded a ${data.type} purchase of ${data.model || data.bikeName || "bike"} in "${businessName}"`,
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
        showroomName: data.showroomName,
        bikeName: data.bikeName,
        model: data.model,
        vin: data.vin || null,
        chassisNo: data.chassisNo || null,
        engineNo: data.engineNo || null,
        registrationNo: data.registrationNo || null,
        horsePower: data.horsePower || null,
        color: data.color || null,
        modelYear: data.modelYear || null,
        purchaseType: data.type,
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
    const purchases = snapshot.docs.map(d => ({ id: d.id, ...d.data(), createdAt: formatDate(d.data().createdAt), updatedAt: formatDate(d.data().updatedAt) }));
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get one purchase
router.get("/:businessId/:purchaseId", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId, purchaseId } = req.params;
  try {
    const doc = await db.collection("businesses").doc(businessId).collection("purchases").doc(purchaseId).get();
    if (!doc.exists) return res.status(404).json({ error: "Purchase not found" });
    const data = doc.data();
    res.json({ id: doc.id, ...data, createdAt: formatDate(data.createdAt), updatedAt: formatDate(data.updatedAt) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update purchase and linked inventory snapshot
router.patch("/:businessId/:purchaseId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId, purchaseId } = req.params;
  const data = normalizeBikePurchase(req.body);
  try {
    const purchaseRef = db.collection("businesses").doc(businessId).collection("purchases").doc(purchaseId);
    await purchaseRef.update({
      ...data,
      updatedAt: new Date(),
      updatedBy: req.user.uid,
      updatedByName: req.user.displayName || req.user.email || "Employee"
    });

    const invSnap = await db.collection("businesses").doc(businessId).collection("inventory")
      .where("purchaseId", "==", purchaseId)
      .limit(1)
      .get();
    if (!invSnap.empty) {
      await invSnap.docs[0].ref.update({
        showroomName: data.showroomName,
        bikeName: data.bikeName,
        model: data.model,
        vin: data.vin || null,
        chassisNo: data.chassisNo || null,
        engineNo: data.engineNo || null,
        registrationNo: data.registrationNo || null,
        horsePower: data.horsePower || null,
        color: data.color || null,
        modelYear: data.modelYear || null,
        purchaseType: data.type,
        purchasePrice: data.price || 0,
        updatedAt: new Date()
      });
    }

    res.json({ message: "Purchase updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete purchase and remove linked unsold inventory item
router.delete("/:businessId/:purchaseId", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId, purchaseId } = req.params;
  try {
    await db.collection("businesses").doc(businessId).collection("purchases").doc(purchaseId).delete();
    const invSnap = await db.collection("businesses").doc(businessId).collection("inventory")
      .where("purchaseId", "==", purchaseId)
      .limit(1)
      .get();
    if (!invSnap.empty && invSnap.docs[0].data().status !== "sold") {
      await invSnap.docs[0].ref.delete();
    }
    res.json({ message: "Purchase deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

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

const normalizeBikeSale = (data) => {
  const finalAmount = toNumber(data.finalAmount ?? data.price ?? data.salePrice, 0);
  const initialDeposit = toNumber(data.initialDeposit ?? data.depositAmount, 0);
  return {
    ...data,
    showroomName: data.showroomName || "",
    bikeName: data.bikeName || data.model || "",
    model: data.model || data.bikeName || "",
    chassisNo: data.chassisNo || data.vin || "",
    vin: data.vin || data.chassisNo || "",
    engineNo: data.engineNo || "",
    registrationNo: data.registrationNo || "",
    horsePower: data.horsePower || data.hoursePower || "",
    customer: data.customer || data.customerName || "",
    customerName: data.customerName || data.customer || "",
    customerPhone: data.customerPhone || data.mobileNo || data.purchaserMobileNo || "",
    customerCnic: data.customerCnic || data.sellCnicNo || "",
    sellCnicNo: data.sellCnicNo || data.customerCnic || "",
    sellRelativeName: data.sellRelativeName || data.relativeName || "",
    sellerAddress: data.sellerAddress || data.address || "",
    purchaserAddress: data.purchaserAddress || data.customerAddress || "",
    initialDeposit,
    finalAmount,
    remainingAmount: toNumber(data.remainingAmount, Math.max(0, finalAmount - initialDeposit)),
    price: finalAmount
  };
};

// Create a sale record and mark inventory item sold
router.post("/:businessId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const data = normalizeBikeSale(req.body);

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
        message: `recorded a sale of ${data.model || data.bikeName || "bike"} for ${data.price || 0} in "${businessName}"`,
        businessId,
        businessName,
        refId: saleRef.id
      });
    }).catch(err => console.error("Notification trigger error:", err));

    // If inventoryId provided, update inventory status
    if (data.inventoryId) {
      const invRef = db.collection("businesses").doc(businessId).collection("inventory").doc(data.inventoryId);
      await invRef.update({
        status: "sold",
        soldAt: new Date(),
        soldPrice: data.price || 0,
        soldTo: data.customer || data.customerName || null,
        customerPhone: data.customerPhone || null,
        customerCnic: data.customerCnic || null,
        saleId: saleRef.id
      });
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
    const sales = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: formatDate(d.data().createdAt), updatedAt: formatDate(d.data().updatedAt) }));
    res.json(sales);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get one sale
router.get("/:businessId/:saleId", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId, saleId } = req.params;
  try {
    const doc = await db.collection("businesses").doc(businessId).collection("sales").doc(saleId).get();
    if (!doc.exists) return res.status(404).json({ error: "Sale not found" });
    const data = doc.data();
    res.json({ id: doc.id, ...data, createdAt: formatDate(data.createdAt), updatedAt: formatDate(data.updatedAt) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update sale
router.patch("/:businessId/:saleId", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId, saleId } = req.params;
  const data = normalizeBikeSale(req.body);
  try {
    await db.collection("businesses").doc(businessId).collection("sales").doc(saleId).update({
      ...data,
      updatedAt: new Date(),
      updatedBy: req.user.uid,
      updatedByName: req.user.displayName || req.user.email || "Employee"
    });

    if (data.inventoryId) {
      await db.collection("businesses").doc(businessId).collection("inventory").doc(data.inventoryId).update({
        soldPrice: data.price || 0,
        soldTo: data.customer || data.customerName || null,
        customerPhone: data.customerPhone || null,
        customerCnic: data.customerCnic || null,
        updatedAt: new Date()
      });
    }

    res.json({ message: "Sale updated" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete sale and optionally reopen linked inventory item
router.delete("/:businessId/:saleId", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId, saleId } = req.params;
  try {
    const saleRef = db.collection("businesses").doc(businessId).collection("sales").doc(saleId);
    const saleDoc = await saleRef.get();
    const data = saleDoc.exists ? saleDoc.data() : {};
    await saleRef.delete();
    if (data.inventoryId) {
      await db.collection("businesses").doc(businessId).collection("inventory").doc(data.inventoryId).update({
        status: "in_stock",
        soldAt: null,
        soldPrice: null,
        soldTo: null,
        saleId: null
      });
    }
    res.json({ message: "Sale deleted" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;

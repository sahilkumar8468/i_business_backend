const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");
const { parsePagination } = require("../utils/pagination");

const RECORD_COLLECTION = "bikeShowroomRecords";

const formatDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const serializeRecord = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    dateTime: formatDate(data.dateTime),
    createdAt: formatDate(data.createdAt),
    updatedAt: formatDate(data.updatedAt)
  };
};

const serializeDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: formatDate(data.createdAt),
    updatedAt: formatDate(data.updatedAt),
    soldAt: formatDate(data.soldAt),
    startDate: formatDate(data.startDate),
    endDate: formatDate(data.endDate),
    installmentsList: (data.installmentsList || []).map((item) => ({
      ...item,
      dueDate: formatDate(item.dueDate),
      paidAt: formatDate(item.paidAt)
    }))
  };
};

const canManageBikeShowroom = (req) => {
  return ["super_admin", "admin", "employee"].includes(req.user?.globalRole) || req.user?.isSuperAdmin;
};

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const isValidPakistaniCnic = (value) => {
  const cnic = toStringValue(value).trim();
  if (!cnic) return true;
  return /^(\d{5}-\d{7}-\d|\d{13})$/.test(cnic);
};

const normalizeRecordPayload = (body) => {
  const totalAmount = toNumber(body.totalAmount);
  const initialAmount = toNumber(body.initialAmount);
  const bikeExpenses = Array.isArray(body.bikeExpenses) ? body.bikeExpenses : [];
  const normalizedExpenses = bikeExpenses.map((expense) => ({
    name: toStringValue(expense.name),
    amount: toNumber(expense.amount),
    description: toStringValue(expense.description)
  })).filter((expense) => expense.name || expense.amount || expense.description);
  const totalExpense = normalizedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remainingAmount = body.remainingAmount === "" || body.remainingAmount === undefined
    ? Math.max(totalAmount - initialAmount, 0)
    : toNumber(body.remainingAmount);
  const purchaserCnicNo = toStringValue(body.purchaserCnicNo).trim();
  const sellerCnicNo = toStringValue(body.sellerCnicNo || body.salerCnicNo).trim();

  if (!isValidPakistaniCnic(purchaserCnicNo)) {
    const error = new Error("Purchaser CNIC must be 13 digits or xxxxx-xxxxxxx-x");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidPakistaniCnic(sellerCnicNo)) {
    const error = new Error("Seller CNIC must be 13 digits or xxxxx-xxxxxxx-x");
    error.statusCode = 400;
    throw error;
  }

  return {
    showroomName: toStringValue(body.showroomName) || "Deewan Autos",
    purchaseCategory: toStringValue(body.purchaseCategory) || "local",
    customerPhoneNo: toStringValue(body.customerPhoneNo),
    dateTime: body.dateTime ? new Date(body.dateTime) : new Date(),
    registrationNo: toStringValue(body.registrationNo),
    engineNo: toStringValue(body.engineNo),
    chasisNo: toStringValue(body.chasisNo || body.chassisNo),
    horsePower: toStringValue(body.horsePower),
    model: toStringValue(body.model),
    company: toStringValue(body.company),
    purchaserName: toStringValue(body.purchaserName),
    purchaserFatherName: toStringValue(body.purchaserFatherName),
    purchaserAddress: toStringValue(body.purchaserAddress),
    purchaserCnicNo,
    purchaserCnicImage: toStringValue(body.purchaserCnicImage),
    sellerName: toStringValue(body.sellerName || body.salerName),
    sellerFatherName: toStringValue(body.sellerFatherName || body.salerFatherName),
    sellerAddress: toStringValue(body.sellerAddress || body.salerAddress),
    sellerCnicNo,
    sellerCnicImage: toStringValue(body.sellerCnicImage || body.salerCnicImage),
    totalAmount,
    initialAmount,
    remainingAmount,
    totalExpense,
    bikeExpenses: normalizedExpenses,
    installmentDuration: toNumber(body.installmentDuration),
    installmentDurationUnit: body.installmentDurationUnit || "month",
    notes: body.notes || ""
  };
};

router.post("/showroom-records", checkAuth, async (req, res) => {
  if (!canManageBikeShowroom(req)) {
    return res.status(403).json({ error: "You do not have permission to manage bike showroom records" });
  }

  try {
    const payload = normalizeRecordPayload(req.body);
    const docRef = db.collection(RECORD_COLLECTION).doc();
    await docRef.set({
      ...payload,
      createdAt: new Date(),
      createdBy: req.user.uid || req.user.email || "system"
    });
    const created = await docRef.get();
    res.status(201).json(serializeRecord(created));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/showroom-records", checkAuth, async (req, res) => {
  if (!canManageBikeShowroom(req)) {
    return res.status(403).json({ error: "You do not have permission to view bike showroom records" });
  }

  try {
    const { page, limit, offset } = parsePagination(req.query);
    const baseQuery = db.collection(RECORD_COLLECTION).orderBy("createdAt", "desc");
    const [totalSnap, pagedSnap] = await Promise.all([
      baseQuery.get(),
      baseQuery.offset(offset).limit(limit).get()
    ]);

    const total = totalSnap.size;
    res.json({
      data: pagedSnap.docs.map(serializeRecord),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/showroom-records/:recordId", checkAuth, async (req, res) => {
  if (!canManageBikeShowroom(req)) {
    return res.status(403).json({ error: "You do not have permission to view bike showroom records" });
  }

  try {
    const doc = await db.collection(RECORD_COLLECTION).doc(req.params.recordId).get();
    if (!doc.exists) return res.status(404).json({ error: "Record not found" });
    res.json(serializeRecord(doc));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch("/showroom-records/:recordId", checkAuth, async (req, res) => {
  if (!canManageBikeShowroom(req)) {
    return res.status(403).json({ error: "You do not have permission to manage bike showroom records" });
  }

  try {
    const docRef = db.collection(RECORD_COLLECTION).doc(req.params.recordId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Record not found" });

    await docRef.update({
      ...normalizeRecordPayload(req.body),
      updatedAt: new Date(),
      updatedBy: req.user.uid || req.user.email || "system"
    });
    const updated = await docRef.get();
    res.json(serializeRecord(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/showroom-records/:recordId", checkAuth, async (req, res) => {
  if (!canManageBikeShowroom(req)) {
    return res.status(403).json({ error: "You do not have permission to delete bike showroom records" });
  }

  try {
    await db.collection(RECORD_COLLECTION).doc(req.params.recordId).delete();
    res.json({ message: "Bike showroom record deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:businessId/dashboard", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;

  try {
    const businessRef = db.collection("businesses").doc(businessId);
    const [purchaseSnap, inventorySnap, salesSnap, installmentSnap] = await Promise.all([
      businessRef.collection("purchases").orderBy("createdAt", "desc").get(),
      businessRef.collection("inventory").orderBy("createdAt", "desc").get(),
      businessRef.collection("sales").orderBy("createdAt", "desc").get(),
      businessRef.collection("installments").orderBy("createdAt", "desc").get()
    ]);

    const purchases = purchaseSnap.docs.map(serializeDoc);
    const inventory = inventorySnap.docs.map(serializeDoc);
    const sales = salesSnap.docs.map(serializeDoc);
    const installments = installmentSnap.docs.map(serializeDoc);

    const now = new Date();
    const overdueInstallments = [];
    installments.forEach((contract) => {
      if (contract.status !== "active") return;
      (contract.installmentsList || []).forEach((item) => {
        if (!item.isPaid && item.dueDate && new Date(item.dueDate) < now) {
          overdueInstallments.push({
            contractId: contract.id,
            customerName: contract.customerName,
            customerPhone: contract.customerPhone,
            itemModel: contract.itemModel,
            month: item.month,
            dueDate: item.dueDate,
            amount: item.amount
          });
        }
      });
    });

    const totals = {
      companyPurchases: purchases.filter((item) => item.type === "company").length,
      localPurchases: purchases.filter((item) => item.type === "local").length,
      purchaseValue: purchases.reduce((sum, item) => sum + Number(item.price || item.finalAmount || 0), 0),
      activeStock: inventory.filter((item) => item.status === "in_stock").length,
      soldStock: inventory.filter((item) => item.status === "sold").length,
      salesValue: sales.reduce((sum, item) => sum + Number(item.price || item.finalAmount || 0), 0),
      installmentReceivable: installments.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0),
      overdueCount: overdueInstallments.length
    };

    res.json({ purchases, inventory, sales, installments, overdueInstallments, totals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

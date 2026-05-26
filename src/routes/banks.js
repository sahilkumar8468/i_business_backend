const express = require("express");
const router = express.Router();
const { db, admin } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");
const { notifyAdmin } = require("../utils/notifyAdmin");

// Create or add a bank account for a business
router.post("/:businessId/accounts", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { name, accountNumber, openingBalance = 0, bankName, notes } = req.body;

  if (!name || !accountNumber) return res.status(400).json({ error: "name and accountNumber required" });

  try {
    const accRef = db.collection("businesses").doc(businessId).collection("bankAccounts").doc();
    await accRef.set({
      name,
      bankName: bankName || null,
      accountNumber,
      balance: Number(openingBalance) || 0,
      notes: notes || null,
      createdAt: new Date()
    });
    res.status(201).json({ id: accRef.id, message: "Bank account added" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add transaction to a bank account (deposit/withdrawal/transfer)
router.post("/:businessId/accounts/:accountId/transactions", checkAuth, checkRole(["owner", "admin", "editor"]), async (req, res) => {
  const { businessId, accountId } = req.params;
  const { type, amount, description, toAccountId, relatedEntryId, date, givenTo, businessId: txBusinessId, businessName: txBusinessName } = req.body;

  if (!type || !amount) return res.status(400).json({ error: "type and amount required" });

  try {
    const accRef = db.collection("businesses").doc(businessId).collection("bankAccounts").doc(accountId);
    const accDoc = await accRef.get();
    if (!accDoc.exists) return res.status(404).json({ error: "Account not found" });

    const actorName = req.user.displayName || req.user.email || "Employee";
    const txRef = accRef.collection("transactions").doc();
    const tx = {
      type,
      amount: Number(amount),
      description: description || null,
      givenTo: givenTo || null,
      businessId: txBusinessId || businessId || null,
      businessName: txBusinessName || null,
      createdBy: req.user.uid,
      createdAt: date ? new Date(date) : new Date(),
      relatedEntryId: relatedEntryId || null
    };
    await txRef.set(tx);

    // Update balances
    let delta = 0;
    if (type === "deposit") delta = Number(amount);
    else if (type === "withdrawal") delta = -Number(amount);

    await accRef.update({ balance: admin.firestore.FieldValue.increment(delta) });

    // If transfer, create transaction on target account
    if (type === "transfer" && toAccountId) {
      const toRef = db.collection("businesses").doc(businessId).collection("bankAccounts").doc(toAccountId);
      const toDoc = await toRef.get();
      if (!toDoc.exists) return res.status(404).json({ error: "Target account not found" });
      const toTxRef = toRef.collection("transactions").doc();
      await toTxRef.set({ ...tx, type: "deposit", amount: Number(amount), fromAccountId: accountId });
      await toRef.update({ balance: admin.firestore.FieldValue.increment(Number(amount)) });
    }

    // Notify parent admin
    db.collection("businesses").doc(businessId).get().then(bizDoc => {
      const businessName = bizDoc.exists ? bizDoc.data().name : "Business";
      notifyAdmin({
        actorUid: req.user.uid,
        actorName,
        type: "bank_transaction",
        message: `added a bank transaction of ${amount} (${type}) in "${businessName}" (${accDoc.data().name})`,
        businessId,
        businessName,
        refId: txRef.id
      });
    }).catch(err => console.error("Notification trigger error:", err));

    res.status(201).json({ id: txRef.id, message: "Transaction recorded" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List accounts
router.get("/:businessId/accounts", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  try {
    const snap = await db.collection("businesses").doc(businessId).collection("bankAccounts").get();
    const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account transactions and balance
router.get("/:businessId/accounts/:accountId", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId, accountId } = req.params;
  try {
    const accRef = db.collection("businesses").doc(businessId).collection("bankAccounts").doc(accountId);
    const accDoc = await accRef.get();
    if (!accDoc.exists) return res.status(404).json({ error: "Account not found" });
    const txSnap = await accRef.collection("transactions").orderBy("createdAt", "desc").get();
    const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt }));
    res.json({ id: accDoc.id, ...accDoc.data(), transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

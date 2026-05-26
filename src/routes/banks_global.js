const express = require("express");
const router = express.Router();
const { db, admin } = require("../firebase");
const { checkAuth } = require("../middleware/auth");
const { notifyAdmin } = require("../utils/notifyAdmin");

// Create global bank account
router.post("/accounts", checkAuth, async (req, res) => {
  const { name, accountNumber, openingBalance = 0, bankName, notes } = req.body;
  if (!name || !accountNumber) return res.status(400).json({ error: "name and accountNumber required" });
  try {
    const accRef = db.collection("globalBankAccounts").doc();
    await accRef.set({
      name,
      bankName: bankName || null,
      accountNumber,
      balance: Number(openingBalance) || 0,
      notes: notes || null,
      createdAt: new Date(),
      createdBy: req.user.uid
    });
    res.status(201).json({ id: accRef.id, message: "Global bank account added" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// List global accounts
router.get("/accounts", checkAuth, async (req, res) => {
  try {
    const snap = await db.collection("globalBankAccounts").get();
    const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(accounts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get account with transactions
router.get("/accounts/:accountId", checkAuth, async (req, res) => {
  const { accountId } = req.params;
  try {
    const accRef = db.collection("globalBankAccounts").doc(accountId);
    const accDoc = await accRef.get();
    if (!accDoc.exists) return res.status(404).json({ error: "Account not found" });
    const txSnap = await accRef.collection("transactions").orderBy("createdAt","desc").get();
    const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt }));
    res.json({ id: accDoc.id, ...accDoc.data(), transactions });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add transaction
router.post("/accounts/:accountId/transactions", checkAuth, async (req, res) => {
  const { accountId } = req.params;
  const { type, amount, description, toAccountId, relatedEntryId, date, givenTo, businessId, businessName } = req.body;
  if (!type || !amount) return res.status(400).json({ error: "type and amount required" });
  try {
    const accRef = db.collection("globalBankAccounts").doc(accountId);
    const accDoc = await accRef.get();
    if (!accDoc.exists) return res.status(404).json({ error: "Account not found" });

    const actorName = req.user.displayName || req.user.email || "Employee";
    const txRef = accRef.collection("transactions").doc();
    const tx = {
      type,
      amount: Number(amount),
      description: description || null,
      givenTo: givenTo || null,
      businessId: businessId || null,
      businessName: businessName || null,
      createdBy: req.user.uid,
      createdAt: date ? new Date(date) : new Date(),
      relatedEntryId: relatedEntryId || null
    };
    await txRef.set(tx);

    let delta = 0;
    if (type === "deposit") delta = Number(amount);
    else if (type === "withdrawal") delta = -Number(amount);

    await accRef.update({ balance: admin.firestore.FieldValue.increment(delta) });

    // transfer between global accounts
    if (type === "transfer" && toAccountId) {
      const toRef = db.collection("globalBankAccounts").doc(toAccountId);
      const toDoc = await toRef.get();
      if (!toDoc.exists) return res.status(404).json({ error: "Target account not found" });
      const toTxRef = toRef.collection("transactions").doc();
      await toTxRef.set({ ...tx, type: "deposit", amount: Number(amount), fromAccountId: accountId });
      await toRef.update({ balance: admin.firestore.FieldValue.increment(Number(amount)) });
    }

    // Notify parent admin
    notifyAdmin({
      actorUid: req.user.uid,
      actorName,
      type: "global_bank_transaction",
      message: `added a global bank transaction of ${amount} (${type}) in "${accDoc.data().name}"`,
      businessId: businessId || null,
      businessName: businessName || null,
      refId: txRef.id
    });

    res.status(201).json({ id: txRef.id, message: "Transaction recorded" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth } = require("../middleware/auth");

// Get cash summary for the current user
router.get("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;

  try {
    const cashRef = db.collection("cash_summary").doc(userId);
    const doc = await cashRef.get();

    if (!doc.exists) {
      // Default data if none exists
      const defaultData = {
        userId,
        business: 0,
        stocks: 0,
        bank: 0,
        home: 0,
        lastUpdated: new Date()
      };
      await cashRef.set(defaultData);
      return res.json({ ...defaultData, total: 0 });
    }

    const data = doc.data();
    const total = (data.business || 0) + (data.stocks || 0) + (data.bank || 0) + (data.home || 0);
    
    res.json({ ...data, total });
  } catch (error) {
    console.error("GET /cash Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update cash summary
router.post("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;
  const { business, stocks, bank, home } = req.body;

  try {
    const cashRef = db.collection("cash_summary").doc(userId);
    
    const updateData = {
      business: Number(business) || 0,
      stocks: Number(stocks) || 0,
      bank: Number(bank) || 0,
      home: Number(home) || 0,
      lastUpdated: new Date()
    };

    await cashRef.set(updateData, { merge: true });
    
    const total = updateData.business + updateData.stocks + updateData.bank + updateData.home;
    res.json({ ...updateData, total, message: "Cash summary updated successfully" });
  } catch (error) {
    console.error("POST /cash Error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

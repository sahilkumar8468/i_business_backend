const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth } = require("../middleware/auth");

// Get all home expenses for the current user
router.get("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;
  const { month, year } = req.query;

  try {
    let query = db.collection("home_expenses").where("userId", "==", userId);
    
    // Simple filter logic
    const snapshot = await query.get();
    let expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (month && year) {
        expenses = expenses.filter(exp => {
            const date = new Date(exp.date);
            return (date.getMonth() + 1) == month && date.getFullYear() == year;
        });
    }

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new expense
router.post("/", checkAuth, async (req, res) => {
  const userId = req.user.uid;
  const { category, amount, date, description } = req.body;

  try {
    const expenseRef = db.collection("home_expenses").doc();
    const expenseData = {
      userId,
      category, // food, rent, utilities, etc.
      amount: Number(amount) || 0,
      date: date ? new Date(date) : new Date(),
      description,
      createdAt: new Date()
    };
    await expenseRef.set(expenseData);
    res.status(201).json({ id: expenseRef.id, ...expenseData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

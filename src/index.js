require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");
const { db } = require("./firebase");
const businessRoutes = require("./routes/business");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("i business API Running");
});

app.use("/admin", adminRoutes);
app.use("/businesses", businessRoutes);


// Old Users route (updated for new db export)
app.post("/users", async (req, res) => {
  try {
    const data = req.body;
    const docRef = await db.collection("users").add(data);
    res.status(201).json({ id: docRef.id, message: "User added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
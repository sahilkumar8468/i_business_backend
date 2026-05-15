require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const { db } = require("./firebase");
const businessRoutes = require("./routes/business");
const adminRoutes = require("./routes/admin");
const cashRoutes = require("./routes/cash");
const assetsRoutes = require("./routes/assets");
const expensesRoutes = require("./routes/expenses");

const app = express();

// Enable CORS for production (Vercel/Render)
app.use(cors({
  origin: "*", // You can restrict this to your Vercel URL later for better security
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const usersRoutes = require("./routes/users");

// Routes
app.get("/", (req, res) => {
  res.send("i business API Running");
});

app.use("/admin", adminRoutes);
app.use("/businesses", businessRoutes);
app.use("/cash", cashRoutes);
app.use("/assets", assetsRoutes);
app.use("/expenses", expensesRoutes);
app.use("/users", usersRoutes);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
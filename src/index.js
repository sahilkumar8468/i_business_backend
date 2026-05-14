require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");
const { db } = require("./firebase");
const businessRoutes = require("./routes/business");
const adminRoutes = require("./routes/admin");
const cashRoutes = require("./routes/cash");
const assetsRoutes = require("./routes/assets");
const expensesRoutes = require("./routes/expenses");

const app = express();

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
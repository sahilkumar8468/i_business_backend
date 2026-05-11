const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.SUPER_ADMIN_USER &&
    password === process.env.SUPER_ADMIN_PASS
  ) {
    const token = jwt.sign(
      { 
        uid: "super-admin", 
        email: username, 
        role: "super_admin" 
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, message: "Super Admin logged in" });
  }

  res.status(401).json({ error: "Invalid credentials" });
});

module.exports = router;

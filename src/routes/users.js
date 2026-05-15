const express = require("express");
const router = express.Router();
const { db, auth, admin } = require("../firebase");
const { checkAuth } = require("../middleware/auth");

const jwt = require("jsonwebtoken");

router.get("/me", checkAuth, async (req, res) => {
  res.json({
    uid: req.user.uid,
    email: req.user.email,
    globalRole: req.user.globalRole || req.user.role,
    isSuperAdmin: req.user.isSuperAdmin || false
  });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const email = `${username}@ibusiness.system`;

  try {
    // We use the Firebase Auth REST API to verify the password since the Admin SDK doesn't support sign-in
    // We need the Web API Key from Firebase Console
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      throw new Error("Firebase Web API Key is not configured in .env");
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firebase Login Error:", data.error);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Return the Firebase ID Token
    res.json({ 
      token: data.idToken, 
      message: "User logged in successfully",
      displayName: data.displayName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", checkAuth, async (req, res) => {
  try {
    if (req.user.globalRole === "employee") {
      return res.status(403).json({ error: "Employees cannot view users." });
    }

    let snapshot;
    if (req.user.isSuperAdmin) {
      snapshot = await db.collection("users").get();
    } else {
      // Only fetch users created by this admin
      snapshot = await db.collection("users").where("createdBy", "==", req.user.uid).get();
    }
    
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", checkAuth, async (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, and role are required" });
  }

  // Construct internal email from username
  const email = `${username}@ibusiness.system`;

  // Validate globalRole permissions
  if (req.user.globalRole === "employee") {
    return res.status(403).json({ error: "Employees cannot create users." });
  }

  if (req.user.globalRole === "admin" && role === "admin") {
    return res.status(403).json({ error: "Admins cannot create other admins. Only Super Admin can do this." });
  }

  try {
    // Create the user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
    });

    // Save user role and relation in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      username,
      email,
      displayName,
      role,
      createdBy: req.user.uid,
      createdAt: new Date(),
    });

    // If businesses are provided, assign the employee to them
    const { businessIds } = req.body;
    if (businessIds && Array.isArray(businessIds)) {
      for (const bId of businessIds) {
        await db.collection("businesses").doc(bId).update({
          memberIds: admin.firestore.FieldValue.arrayUnion(userRecord.uid)
        });
        
        await db.collection("businesses").doc(bId).collection("members").doc(userRecord.uid).set({
          userId: userRecord.uid,
          name: displayName || username,
          role: "employee",
          joinedAt: new Date()
        });
      }
    }

    res.status(201).json({ 
      id: userRecord.uid, 
      message: "User created and assigned to businesses successfully",
      user: { username, displayName, role }
    });
  } catch (error) {
    console.error("POST /users Error:", error);
    
    // Provide a clear, actionable error message for the common Firebase configuration issue
    if (error.code === 'auth/configuration-not-found' || error.message.includes('configuration-not-found')) {
      return res.status(400).json({ 
        error: "Firebase Authentication is not enabled. Please go to your Firebase Console, click 'Authentication', then 'Get Started', and enable 'Email/Password' sign-in." 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// PATCH /users/:userId/assign-businesses — Assign an existing user to businesses
router.patch("/:userId/assign-businesses", checkAuth, async (req, res) => {
  if (req.user.globalRole === "employee") {
    return res.status(403).json({ error: "Employees cannot assign businesses." });
  }

  const { userId } = req.params;
  const { businessIds } = req.body;

  if (!businessIds || !Array.isArray(businessIds)) {
    return res.status(400).json({ error: "businessIds array is required" });
  }

  try {
    // Get the target user's info
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userData = userDoc.data();

    for (const bId of businessIds) {
      // Add to memberIds array
      await db.collection("businesses").doc(bId).update({
        memberIds: admin.firestore.FieldValue.arrayUnion(userId)
      });
      // Set member document with employee role
      await db.collection("businesses").doc(bId).collection("members").doc(userId).set({
        userId,
        name: userData.displayName || userData.username,
        role: userData.role || "employee",
        joinedAt: new Date()
      });
    }

    res.json({ message: `User assigned to ${businessIds.length} business(es) successfully` });
  } catch (error) {
    console.error("PATCH /assign-businesses Error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

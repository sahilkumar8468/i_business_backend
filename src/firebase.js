const admin = require("firebase-admin");
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e);
  }
} else {
  try {
    serviceAccount = require("../serviceAccountKey.json");
  } catch (e) {
    console.warn("serviceAccountKey.json not found, using environment variables if available.");
  }
}

if (!serviceAccount) {
  console.error("❌ CRITICAL ERROR: No Firebase Service Account found!");
  console.error("Please ensure 'FIREBASE_SERVICE_ACCOUNT' is set in your Vercel/Railway Environment Variables.");
} else {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
  });
  console.log("✅ Firebase initialized successfully using " + (process.env.FIREBASE_SERVICE_ACCOUNT ? "Environment Variable" : "Local File"));
}


const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth, admin };

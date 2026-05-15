const admin = require("firebase-admin");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("Firebase: Loading service account from environment variable.");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e);
  }
} else {
  try {
    serviceAccount = require("../serviceAccountKey.json");
    console.log("Firebase: Loading service account from serviceAccountKey.json.");
  } catch (e) {
    console.warn("serviceAccountKey.json not found, using environment variables if available.");
  }
}

if (!serviceAccount) {
  console.error(" CRITICAL ERROR: No Firebase Service Account found!");
  console.error("Please ensure 'FIREBASE_SERVICE_ACCOUNT' is set in your Vercel/Railway Environment Variables.");
} else {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
  });
  console.log("✅ Firebase initialized successfully using " + (process.env.FIREBASE_SERVICE_ACCOUNT ? "Environment Variable" : "Local File"));
}

let db, auth;
if (serviceAccount) {
  db = admin.firestore();
  auth = admin.auth();
} else {
  console.warn("⚠️ Firebase services (db, auth) not initialized because serviceAccount is missing. Application may crash on API calls.");
}

module.exports = { db, auth, admin };

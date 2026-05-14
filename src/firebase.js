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
  console.warn("No service account configuration found. Firebase may not initialize correctly.");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
});


const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth, admin };

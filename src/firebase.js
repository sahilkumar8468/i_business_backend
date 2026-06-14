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

let initOptions = {};

if (serviceAccount && typeof serviceAccount === "object" && Object.keys(serviceAccount).length) {
  initOptions.credential = admin.credential.cert(serviceAccount);
  initOptions.projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID;
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // If a path to a service account JSON is provided via env var, use application default
  console.info("Using application default credentials from GOOGLE_APPLICATION_CREDENTIALS.");
  initOptions.credential = admin.credential.applicationDefault();
  if (process.env.FIREBASE_PROJECT_ID) initOptions.projectId = process.env.FIREBASE_PROJECT_ID;
} else {
  // No explicit credentials found — initialize without cert. On GCP this will pick up ADC.
  console.warn("Initializing Firebase without explicit credentials. Relying on default credentials if available.");
  if (process.env.FIREBASE_PROJECT_ID) initOptions.projectId = process.env.FIREBASE_PROJECT_ID;
}

try {
  admin.initializeApp(initOptions);
} catch (err) {
  console.error("Failed to initialize Firebase Admin SDK:", err);
  throw err;
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth, admin };

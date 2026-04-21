import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(
  __dirname,
  "../../auth/testggfb-bde24-firebase-adminsdk-fbsvc-e4767d08cd.json",
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: "testggfb-bde24.appspot.com",
});

const bucket = admin.storage().bucket();

export { bucket };

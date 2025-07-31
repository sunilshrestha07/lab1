import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Storage } from "@google-cloud/storage";

initializeApp();

const firestore = getFirestore("codeyalaya");
const storage = new Storage();

const rawVideoBucketName = "codeyalaya-yt-raw-videos";

const videoCollectionId = "videos";

export interface Video {
  id?: string;
  uid?: string;
  filename?: string;
  status?: "processing" | "processed";
  title?: string;
  description?: string;
}

export const createUser = functions.auth.user().onCreate(async (user) => {
  if (!user || !user.uid) {
    logger.error("Invalid user data received");
    return;
  }

  const userInfo = {
    uid: user.uid,
    email: user.email || null,
    photoUrl: user.photoURL || null,
    createdAt: new Date().toISOString(),
  };

  try {
    await firestore.collection("users").doc(user.uid).set(userInfo);
    logger.info(`User Created: ${JSON.stringify(userInfo)}`);
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error("Error writing to Firestore:", { message: errorMessage });
    return { success: false, error: errorMessage };
  }
});

export const generateUploadUrl = onCall(
  { maxInstances: 1 },
  async (request) => {
    // Check if the user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The function must be called while authenticated."
      );
    }

    const auth = request.auth;
    const data = request.data;
    const bucket = storage.bucket(rawVideoBucketName);

    // Generate a unique filename
    const fileName = `${auth.uid}-${Date.now()}.${data.fileExtension}`;

    // Get a v4 signed URL for uploading file
    const [url] = await bucket.file(fileName).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return { url, fileName };
  }
);

export const getVideos = onCall({ maxInstances: 1 }, async () => {
  const snapshot = await firestore
    .collection(videoCollectionId)
    .limit(10)
    .get();
  return snapshot.docs.map((doc) => doc.data());
});

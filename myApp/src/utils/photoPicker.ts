/**
 * Choosing a profile photo from the device's library.
 *
 * The picker is the platform's own UI; this module wraps it so the two profile
 * screens share one permission flow and one set of guards, and so the checks
 * that mirror the backend's own limits live next to the reason they exist.
 */

import * as ImagePicker from "expo-image-picker";

/**
 * What the upload endpoint will accept.
 *
 * Mirrors ALLOWED_IMAGE_CONTENT_TYPES in src/utils/constants.py. Checked here
 * as well as on the server because the two failure modes look identical to the
 * user otherwise: a rejected pick and a rejected upload both end in an error,
 * but only this one can avoid spending the upload to find out.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);

/** MAX_UPLOAD_BYTES in src/utils/constants.py. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/**
 * Extension -> content type, for the assets that arrive without a `mimeType`.
 *
 * HEIC is in here to be *recognised*, not accepted: iOS photo libraries return
 * it routinely, and naming it beats telling someone their photo is
 * "application/octet-stream" when it is a perfectly ordinary iPhone picture.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PickedPhoto = {
  /** A local file:// URI, which is what the multipart upload streams from. */
  uri: string;
  fileName: string;
  mimeType: string;
};

export type PickPhotoResult =
  | { status: "picked"; photo: PickedPhoto }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function extensionOf(nameOrUri: string): string | null {
  const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(nameOrUri);
  return match ? match[1].toLowerCase() : null;
}

function guessMimeType(nameOrUri: string): string {
  const extension = extensionOf(nameOrUri);
  return (extension && MIME_BY_EXTENSION[extension]) || "application/octet-stream";
}

/**
 * Ask for library access, then let the user pick a square photo.
 *
 * Resolves rather than throwing in every case: "they cancelled" and "they said
 * no to the permission prompt" are ordinary outcomes of tapping a camera icon,
 * not exceptions, and a caller that has to `try/catch` to tell them apart ends
 * up treating a cancelled pick as an error.
 */
export async function pickProfilePhoto(): Promise<PickPhotoResult> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        status: "error",
        message: permission.canAskAgain
          ? "Photo library access is needed to choose a profile picture."
          : "Photo library access is off for BloodBridge. Turn it on in your device settings to change your picture.",
      };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Square, because the avatar is a circle: cropping here is what stops the
      // donor discovering afterwards that the middle of their photo is now the
      // only part anyone sees.
      allowsEditing: true,
      aspect: [1, 1],
      // Re-encodes rather than sending the original, which both keeps the file
      // under the server's 5 MB limit and is what turns an iOS HEIC into a JPEG
      // in the common case.
      quality: 0.8,
    });

    if (result.canceled) return { status: "cancelled" };

    const asset = result.assets[0];
    if (!asset) return { status: "cancelled" };

    const name = asset.fileName ?? asset.uri;
    const mimeType = asset.mimeType ?? guessMimeType(name);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        status: "error",
        message: `That image format (${mimeType}) isn't supported. Choose a JPEG, PNG or WebP.`,
      };
    }

    // fileSize is optional on the asset, so an unknown size is left to the
    // server's own check rather than guessed at.
    if (typeof asset.fileSize === "number" && asset.fileSize > MAX_UPLOAD_BYTES) {
      return {
        status: "error",
        message: `That image is ${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB.`,
      };
    }

    return {
      status: "picked",
      photo: {
        uri: asset.uri,
        // React Native drops `filename` from the multipart part unless it is a
        // non-empty string, and Cloudinary reads the format off the name — so
        // an asset that arrives nameless, or named without an extension, gets
        // one derived from its content type rather than being sent bare.
        fileName:
          asset.fileName && asset.fileName.includes(".")
            ? asset.fileName
            : `profile.${EXTENSION_BY_MIME[mimeType] ?? "jpg"}`,
        mimeType,
      },
    };
  } catch {
    return {
      status: "error",
      message: "Could not open your photo library. Please try again.",
    };
  }
}

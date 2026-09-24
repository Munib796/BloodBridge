/**
 * Edits a signed-in user makes to their own record — name, phone, a donor's
 * stored location, their profile picture, and the email that resets their
 * password.
 *
 * Every one of these returns the full updated profile, so callers hand the
 * result to AuthContext's `applyProfile` rather than assuming the write
 * matched what they sent. That also means a screen never has to re-read
 * `/{role}/me` afterwards to find out what the backend actually stored.
 */

import { ApiError, api, UPLOAD_TIMEOUT_MS } from "./apiClient";
import type { DonorProfile, RequestorProfile } from "./apiTypes";

/**
 * The two roles with a self-service profile.
 *
 * This stays separate from the app-wide UserRole so each endpoint map only
 * accepts roles supported by the corresponding profile operation.
 */
export type EditableRole = "donor" | "requestor";

const PROFILE_PATHS: Record<EditableRole, string> = {
  donor: "/donors/me",
  requestor: "/requestors/me",
};

const FORGOT_PASSWORD_PATHS: Record<EditableRole, string> = {
  donor: "/donors/forgot-password",
  requestor: "/requestors/forgot-password",
};

/**
 * PATCH /{role}/me with `{ full_name }`.
 *
 * The DTO is a patch — `full_name` and `phone` are both optional and the
 * controller skips anything unset — so sending one field leaves the other
 * untouched. Verified in the controller, not assumed: it iterates
 * `model_dump(exclude_unset=True)` and skips nulls, which is also why an
 * explicit `null` cannot be used to clear a field.
 */
export async function updateFullName(
  role: EditableRole,
  fullName: string,
): Promise<DonorProfile | RequestorProfile> {
  return api.patch<DonorProfile | RequestorProfile>(PROFILE_PATHS[role], {
    full_name: fullName,
  });
}

/** PATCH /{role}/me with `{ phone }`. */
export async function updatePhone(
  role: EditableRole,
  phone: string,
): Promise<DonorProfile | RequestorProfile> {
  return api.patch<DonorProfile | RequestorProfile>(PROFILE_PATHS[role], { phone });
}

/**
 * PATCH /donors/me/location.
 *
 * Donor-only — a requestor has no stored location and no such endpoint.
 *
 * All three fields every time, because `DonorUpdateLocation` requires all
 * three: there is no partial update, so even correcting just the area label
 * means supplying fresh coordinates alongside it.
 *
 * The response is a `DonorOut`, which carries `area_label` but never the
 * coordinates. The backend does not hand a location back to the app, which is
 * why the profile screen can display the label it was told and nothing more.
 */
export async function updateDonorLocation(location: {
  latitude: number;
  longitude: number;
  areaLabel: string;
}): Promise<DonorProfile> {
  return api.patch<DonorProfile>("/donors/me/location", {
    latitude: location.latitude,
    longitude: location.longitude,
    area_label: location.areaLabel,
  });
}

/**
 * POST /{role}/forgot-password, with `{ email }`. Rate-limited to 3/minute.
 *
 * Unauthenticated, and it answers identically whether or not the address
 * exists — deliberately, so it can't be used to find out who has an account.
 * A resolved promise therefore means "the request was accepted", not "an email
 * is definitely on its way", which is why the confirmation copy has to be
 * conditional rather than a flat "sent".
 */
export async function sendPasswordResetLink(
  role: EditableRole,
  email: string,
): Promise<void> {
  await api.post(FORGOT_PASSWORD_PATHS[role], { email }, { auth: false });
}

/**
 * The multipart part, shaped the way React Native requires.
 *
 * React Native's FormData is not the web one. A file part is a plain object
 * with a `uri` that the native layer reads off disk — its own type is
 * `string | {name?, type?, uri}` (Libraries/Network/FormData.js). It has no
 * concept of a Blob or a File, and handing it one produces a request that fails
 * before it reaches the network.
 *
 * The cast is a TypeScript formality — the DOM typings only describe Blob — and
 * erases at compile time, so the object literal below is what actually crosses
 * the bridge.
 *
 * Validated rather than trusted: a part missing either field reaches the native
 * layer and comes back as an opaque request failure, which the app cannot tell
 * apart from a dead network. Throwing here names it.
 */
const PROFILE_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function filePart(photo: { uri: string; fileName: string; mimeType: string }): { uri: string; name: string; type: string } {
  const { uri, fileName } = photo;
  const fileExtension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  const legacyMimeType =
    fileExtension === "png"
      ? "image/png"
      : fileExtension === "webp"
        ? "image/webp"
        : fileExtension === "jpg" || fileExtension === "jpeg"
          ? "image/jpeg"
          : "";
  const mimeType =
    photo.mimeType === "image/pjpeg"
      ? "image/jpeg"
      : PROFILE_IMAGE_EXTENSIONS[photo.mimeType]
        ? photo.mimeType
        : photo.mimeType === "image"
          ? legacyMimeType
          : "";

  if (!uri || !mimeType) {
    throw new ApiError(
      0,
      `The photo upload was built without a ${uri ? "supported content type" : "file URI"}, so it was never sent.`,
      null,
      "client",
    );
  }

  // Always create a fresh plain object. The native FormData bridge rejects
  // picker asset objects and needs a real filename extension beside the MIME.
  const extension = PROFILE_IMAGE_EXTENSIONS[mimeType];
  const name = /\.[a-z0-9]+$/i.test(fileName) ? fileName : `profile.${extension}`;

  return { uri: String(uri), name: String(name), type: String(mimeType) };
}

/**
 * POST /{role}/me/profile-pic, as multipart form-data.
 *
 * The raw file goes straight up: the backend hands it to Cloudinary itself
 * (src/utils/cloudinary_utils.py), so there is no SDK, no upload preset and no
 * credentials on this side — and nothing here should ever grow one.
 *
 * The api client deliberately leaves the Content-Type header off a FormData
 * body; setting it would omit the multipart boundary `fetch` generates, and the
 * request would arrive unparseable.
 *
 * Rate-limited to 10/minute, and it answers 413 for anything over 5 MB and 415
 * for a type it won't take — both worth showing verbatim.
 */
export async function uploadProfilePicture(
  role: EditableRole,
  photo: { uri: string; fileName: string; mimeType: string },
): Promise<DonorProfile | RequestorProfile> {
  const form = new FormData();
  const pickedAsset = filePart(photo);
  const file = {
    uri: pickedAsset.uri,
    name: pickedAsset.name,
    type: pickedAsset.type,
  };
  form.append("file", file as unknown as Blob);

  return api.post<DonorProfile | RequestorProfile>(
    `${PROFILE_PATHS[role]}/profile-pic`,
    form,
    // Overrides the client's 15s default, which is sized for a JSON round trip.
    // A multi-megabyte photo over a phone's connection routinely needs longer,
    // and aborting mid-upload is reported the same way a dead backend is.
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  );
}

/** DELETE /{role}/me/profile-pic, clearing the account's profile picture. */
export async function removeProfilePicture(
  role: EditableRole,
): Promise<DonorProfile | RequestorProfile> {
  return api.delete<DonorProfile | RequestorProfile>(`${PROFILE_PATHS[role]}/profile-pic`);
}

/** DELETE /{role}/me — permanently ends the user's active account session. */
export async function deleteAccount(role: EditableRole): Promise<void> {
  await api.delete<void>(PROFILE_PATHS[role]);
}

/**
 * "Ahmed Raza" -> "AR", for an avatar circle.
 *
 * Takes null because the callers that show one are rendering a profile or a
 * match participant that may not have a name yet; a blank circle reads as a
 * loading bug, where "?" reads as a missing name.
 */
export function initialsFrom(name: string | null): string {
  if (!name) return "?";

  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");

  return letters ? letters.toUpperCase() : "?";
}

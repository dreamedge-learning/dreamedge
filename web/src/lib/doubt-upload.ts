import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DOUBT_IMAGE_BUCKET,
  DOUBT_IMAGE_MAX_BYTES,
  DOUBT_IMAGE_TYPES,
} from "@/lib/doubts";
import type { Database } from "@/types/supabase";

/**
 * Browser-side photo handling for doubts.
 *
 * The upload goes straight from the browser to the bucket rather than through
 * a server action. A server action body is capped at 1 MB by default, and a
 * phone photo is several times that before it is shrunk -- routing it through
 * our own function would mean either raising the cap for every action on the
 * site or refusing most real photos. The storage policies check the folder,
 * so going direct gives nothing away.
 */

/** Longest side after shrinking. Enough to read handwriting on a page. */
const MAX_DIMENSION = 1600;

/** Below this an allowed file is sent as it is, keeping a crisp screenshot. */
const PASS_THROUGH_BYTES = 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class DoubtImageError extends Error {}

function isAllowedType(type: string): boolean {
  return (DOUBT_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Scales a photo down and re-encodes it as JPEG.
 *
 * A notebook page shot on a phone is 3-8 MB and 4000 px wide; at 1600 px and
 * JPEG 0.85 it is a few hundred kilobytes and every line is still legible,
 * which matters on the mobile data most students are on. Decoding through the
 * browser also turns an iPhone's HEIC into something the bucket accepts.
 */
async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new DoubtImageError("That photo could not be read. Please choose a JPG or PNG image.");
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new DoubtImageError("That photo could not be prepared. Please try another one.");
  }

  // JPEG has no transparency; a transparent PNG would otherwise turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) {
    throw new DoubtImageError("That photo could not be prepared. Please try another one.");
  }
  return blob;
}

/** Throws DoubtImageError with a message fit to show as it is. */
export async function prepareDoubtImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new DoubtImageError("Please choose an image file.");
  }

  const prepared =
    isAllowedType(file.type) && file.size <= PASS_THROUGH_BYTES ? file : await shrink(file);

  if (prepared.size > DOUBT_IMAGE_MAX_BYTES) {
    throw new DoubtImageError("That photo is too large. Please choose one under 5 MB.");
  }
  return prepared;
}

/**
 * Uploads a prepared photo and returns its object path.
 *
 * `as` picks the folder the storage policies expect: a student writes under
 * their own auth id, a teacher under `staff/<auth id>`. The name is a fresh
 * UUID so nothing about the student or the doubt is readable from it.
 */
export async function uploadDoubtImage(
  supabase: SupabaseClient<Database>,
  file: File,
  as: "student" | "staff"
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new DoubtImageError("Your session has ended. Please sign in again.");
  }

  const blob = await prepareDoubtImage(file);
  const type = blob.type && isAllowedType(blob.type) ? blob.type : "image/jpeg";
  const folder = as === "staff" ? `staff/${user.id}` : user.id;
  const path = `${folder}/${crypto.randomUUID()}.${EXTENSION[type]}`;

  const { error } = await supabase.storage
    .from(DOUBT_IMAGE_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });

  if (error) {
    console.error("uploadDoubtImage failed:", error);
    throw new DoubtImageError("The photo could not be uploaded. Please try again.");
  }
  return path;
}

/**
 * Takes back a photo whose doubt or reply was refused. Only an unattached
 * upload can be removed (the bucket's delete policy says so), and a failure
 * here leaves a stray file rather than a broken thread, so it is not reported.
 */
export async function discardDoubtImage(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(DOUBT_IMAGE_BUCKET).remove([path]);
  if (error) console.error("discardDoubtImage failed:", error);
}

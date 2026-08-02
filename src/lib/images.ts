// Image capture pipeline — camera photos come in at 3–10 MB with EXIF
// rotation; stored raw as data URLs they blow the ~5 MB localStorage quota
// after two pages. Every upload is downscaled to ≤2048px on the long edge,
// EXIF orientation baked in, and re-encoded as JPEG. Budget target is
// ~350 KB/page (15 MB story ceiling, docs/format-spec.md).

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.82;

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  // imageOrientation: "from-image" applies EXIF rotation during decode, so a
  // sideways kitchen-table photo comes out upright everywhere.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { dataUrl, width, height };
  } finally {
    bitmap.close();
  }
}

/** Fallback for browsers without createImageBitmap options support. */
export async function processImageSafe(file: File | Blob): Promise<ProcessedImage> {
  try {
    return await processImage(file);
  } catch {
    // Last resort: raw data URL (no resize). Better a big image than no image.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return { dataUrl, width: 0, height: 0 };
  }
}

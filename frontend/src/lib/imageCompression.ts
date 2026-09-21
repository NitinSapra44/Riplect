const MAX_DIMENSION = 1600;
// Guarantee the uploaded file stays small enough to transfer reliably. Large
// originals (10-25MB phone photos) stall mid-transfer through the upload proxy,
// freezing the progress bar (e.g. at ~15%) forever. We keep compressing until
// the result is under this size.
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;
// If we genuinely cannot compress an image, we may still upload the ORIGINAL
// only when it is already small enough to transfer safely. Anything larger is
// rejected loudly so the UI shows an error instead of hanging forever.
const SAFE_ORIGINAL_BYTES = 2 * 1024 * 1024;

interface DecodedImage {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  // Prefer createImageBitmap: it decodes large images and HEIC (on Safari) more
  // reliably than HTMLImageElement and applies EXIF orientation.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // fall through to HTMLImageElement
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("image decode failed"));
      i.src = objectUrl;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(",");
    if (!base64) return null;
    const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    // toBlob is preferred but returns null on some Safari/iOS versions; fall
    // back to toDataURL so we still get a small encoded image.
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          try {
            resolve(dataUrlToBlob(canvas.toDataURL("image/jpeg", quality)));
          } catch {
            resolve(null);
          }
        },
        "image/jpeg",
        quality,
      );
    } else {
      try {
        resolve(dataUrlToBlob(canvas.toDataURL("image/jpeg", quality)));
      } catch {
        resolve(null);
      }
    }
  });
}

/**
 * Resize + re-encode an image to a small JPEG so it uploads reliably.
 *
 * Throws if the image cannot be compressed AND the original is too large to
 * transfer safely — callers should surface this as an upload error rather than
 * sending a multi-MB original that would stall mid-transfer.
 */
export async function compressImage(file: File): Promise<File> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    if (file.size <= SAFE_ORIGINAL_BYTES) return file;
    throw new Error(
      "Could not process this image. Please try a different photo or format.",
    );
  }

  try {
    const { width: w, height: h } = decoded;
    if (!w || !h) {
      if (file.size <= SAFE_ORIGINAL_BYTES) return file;
      throw new Error("Could not read this image. Please try a different photo.");
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    let targetW = Math.max(1, Math.round(w * scale));
    let targetH = Math.max(1, Math.round(h * scale));
    let quality = 0.8;
    let blob: Blob | null = null;

    // Keep reducing quality, then dimensions, until the encoded image is under
    // the transfer-safe target. Stop once dimensions hit a small floor.
    for (let attempt = 0; attempt < 12; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      decoded.draw(ctx, targetW, targetH);

      blob = await encodeCanvas(canvas, quality);
      if (!blob) break;
      if (blob.size <= TARGET_MAX_BYTES) break;

      // Still too big: lower quality first, then shrink dimensions.
      if (quality > 0.5) {
        quality = Math.max(0.5, quality - 0.15);
      } else if (Math.max(targetW, targetH) > 320) {
        targetW = Math.max(1, Math.round(targetW * 0.8));
        targetH = Math.max(1, Math.round(targetH * 0.8));
      } else {
        break; // hit the floor; accept whatever we have
      }
    }

    // Never return an oversized result: a multi-MB upload is exactly what stalls.
    if (!blob || blob.size > TARGET_MAX_BYTES) {
      if (file.size <= SAFE_ORIGINAL_BYTES) return file;
      throw new Error(
        "Could not compress this image enough to upload. Please try a different photo.",
      );
    }

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.cleanup();
  }
}

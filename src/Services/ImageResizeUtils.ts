/**
 * Prepares a chosen file for upload in the browser: decode, downscale, re-encode.
 *
 * Doing it here rather than on the API is what keeps the server free of an image library. It also
 * means a 12 MB phone photo never crosses the network — the two variants a post needs are a few
 * hundred kilobytes each by the time they leave.
 */

/** Long edge of the image shown on a photo's own page. */
export const FULL_MAX_EDGE = 1600;
/** Long edge of the grid thumbnail. Twice the tile's CSS size, so it stays sharp on a 2× display. */
export const THUMB_MAX_EDGE = 600;

export interface PreparedImage {
  blob: Blob;
  /** Intrinsic size after downscaling, which the grid uses to reserve each tile's box. */
  width: number;
  height: number;
}

/** Cached because it costs a canvas encode, and the answer cannot change within a page load. */
let webpSupport: boolean | null = null;

function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  return webpSupport;
}

/** The format uploads are encoded as; WebP where the browser can produce it, JPEG otherwise. */
export const outputType = (): string => (supportsWebp() ? "image/webp" : "image/jpeg");

function scaledSize(width: number, height: number, maxEdge: number): [number, number] {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return [width, height];

  const ratio = maxEdge / longest;
  return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode the image."))),
      type,
      quality
    );
  });
}

/**
 * Decodes `file` and returns it downscaled to `maxEdge`. `imageOrientation: "from-image"` applies
 * the EXIF rotation during decode; without it a portrait phone photo arrives on its side, because
 * the canvas draws raw pixels and drops the orientation tag that told the viewer to turn them.
 */
export async function prepareImage(file: File, maxEdge: number, quality = 0.86): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const [width, height] = scaledSize(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not open a drawing context.");

    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    return { blob: await toBlob(canvas, outputType(), quality), width, height };
  } finally {
    // Frees the decoded pixels immediately rather than at the next GC, which matters when someone
    // picks several large photos in a row.
    bitmap.close();
  }
}

/** Both variants one post needs, decoded once each. */
export async function prepareVariants(file: File): Promise<{ full: PreparedImage; thumb: PreparedImage }> {
  const full = await prepareImage(file, FULL_MAX_EDGE);
  const thumb = await prepareImage(file, THUMB_MAX_EDGE, 0.8);
  return { full, thumb };
}

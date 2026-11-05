import sharp from "sharp";

// Re-encodes an uploaded photo as a web-sized WebP. This does three jobs at once:
//  - shrinks multi-megabyte phone photos so the site loads quickly on mobile data
//  - applies the camera's rotation, then drops all metadata, including GPS location
//  - refuses files that are not really images, or are absurdly large when decoded
export async function toWebp(
  input: Buffer,
  maxEdge = 1600,
  quality = 78
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Small square-ish version for grids. Gallery grids show dozens of these, so they must stay light.
export async function toThumbWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}

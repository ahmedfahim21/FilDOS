import { nativeImage, type NativeImage } from 'electron';
import { promises as fs } from 'node:fs';
import { bgraToRgba, heifSize } from './heif';
import type { DecodedImage } from './signals';

/**
 * Pictures the model runtime can't decode (HEIC/HEIF) go through the
 * operating system's own codecs: QuickLook on macOS, the shell thumbnailer on
 * Windows (needs the HEIF extension, preinstalled on most machines). Linux has
 * no equivalent, so there such pictures are indexed by name.
 */
export const canDecodeWithOs = process.platform === 'darwin' || process.platform === 'win32';

/** Longest side asked of the OS; the vision encoder downsizes to its budget anyway. */
const MAX_SIDE = 1024;

/** HEIF keeps its item properties (and so the picture's size) near the start. */
const HEADER_BYTES = 256 * 1024;

/**
 * A HEIF picture decoded by the OS, at most `maxSide` px on its longer side;
 * throws when it can't. The OS thumbnailer stretches to whatever box it's
 * given, so the box takes the picture's own aspect ratio from its container.
 */
export async function osThumbnail(path: string, maxSide = MAX_SIDE): Promise<NativeImage> {
  const file = await fs.open(path, 'r');
  let header: Uint8Array;
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(HEADER_BYTES), 0, HEADER_BYTES, 0);
    header = buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
  const size = heifSize(header);
  if (!size) throw new Error('No picture size in this HEIF file.');
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  const box = { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
  const img = await nativeImage.createThumbnailFromPath(path, box);
  if (img.isEmpty()) throw new Error('The system could not decode this picture.');
  return img;
}

/** Decode a picture with the OS's codecs into RGBA pixels; throws when it can't. */
export async function decodeImageWithOs(path: string): Promise<DecodedImage> {
  const img = await osThumbnail(path);
  const { width, height } = img.getSize();
  return { width, height, rgba: bgraToRgba(new Uint8Array(img.toBitmap())) };
}

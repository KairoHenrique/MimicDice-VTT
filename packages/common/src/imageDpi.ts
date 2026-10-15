const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const INCHES_PER_METER = 39.3701;
const CENTIMETERS_PER_INCH = 2.54;
const MIN_PLAUSIBLE_DPI = 10;
const MAX_PLAUSIBLE_DPI = 4096;
/** Enough of the file to reach the density header of PNG and JPEG images. */
export const IMAGE_DPI_HEADER_BYTES = 128 * 1024;

function plausible(dpi: number): number | null {
  const rounded = Math.round(dpi);
  return rounded >= MIN_PLAUSIBLE_DPI && rounded <= MAX_PLAUSIBLE_DPI ? rounded : null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

/** PNG keeps the density in the optional "pHYs" chunk, in pixels per meter, before the image data. */
function pngDpi(bytes: Uint8Array): number | null {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === "pHYs" && offset + 17 <= bytes.length) {
      const pixelsPerUnit = readUint32(bytes, offset + 8);
      const unitIsMeter = bytes[offset + 16] === 1;
      return unitIsMeter ? plausible(pixelsPerUnit / INCHES_PER_METER) : null;
    }
    if (type === "IDAT" || type === "IEND") return null;
    offset += 12 + length;
  }
  return null;
}

/** JPEG keeps the density in the JFIF (APP0) segment: units 1 = dots per inch, 2 = dots per centimeter. */
function jpegDpi(bytes: Uint8Array): number | null {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = readUint16(bytes, offset + 2);
    const isJfif = marker === 0xe0 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 9)) === "JFIF\0";
    if (isJfif && offset + 16 <= bytes.length) {
      const units = bytes[offset + 11];
      const density = readUint16(bytes, offset + 12);
      if (units === 1) return plausible(density);
      if (units === 2) return plausible(density * CENTIMETERS_PER_INCH);
      return null;
    }
    if (marker === 0xda || length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** Dots per inch stored in a PNG or JPEG header; null when the file says nothing usable. */
export function readImageDpi(bytes: Uint8Array): number | null {
  if (isPng(bytes)) return pngDpi(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegDpi(bytes);
  return null;
}

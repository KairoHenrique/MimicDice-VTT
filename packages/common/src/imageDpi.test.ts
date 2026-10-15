import { describe, expect, it } from "vitest";
import { readImageDpi } from "./imageDpi";

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  return [...uint32(data.length), ...Array.from(type, (character) => character.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function png(...chunks: number[][]): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);
}

function jpeg(units: number, density: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, units, density >> 8, density & 0xff, density >> 8, density & 0xff, 0x00, 0x00];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xda, 0x00, 0x02]);
}

describe("readImageDpi", () => {
  it("reads the pixels per meter of a PNG pHYs chunk as DPI", () => {
    const header = chunk("IHDR", new Array(13).fill(0));
    expect(readImageDpi(png(header, chunk("pHYs", [...uint32(5512), ...uint32(5512), 1])))).toBe(140);
  });

  it("ignores PNGs without density or with an unknown unit", () => {
    const header = chunk("IHDR", new Array(13).fill(0));
    expect(readImageDpi(png(header, chunk("IDAT", [0])))).toBeNull();
    expect(readImageDpi(png(header, chunk("pHYs", [...uint32(5512), ...uint32(5512), 0])))).toBeNull();
  });

  it("reads JFIF density in inches and centimeters", () => {
    expect(readImageDpi(jpeg(1, 300))).toBe(300);
    expect(readImageDpi(jpeg(2, 118))).toBe(300);
    expect(readImageDpi(jpeg(0, 1))).toBeNull();
  });

  it("returns null for other or truncated files", () => {
    expect(readImageDpi(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
    expect(readImageDpi(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

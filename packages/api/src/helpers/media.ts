export const IMAGE_FILE_EXTENSIONS = Object.freeze({ apng: "image/apng", avif: "image/avif", bmp: "image/bmp", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", tiff: "image/tiff", webp: "image/webp" });
export const VIDEO_FILE_EXTENSIONS = Object.freeze({ m4v: "video/mp4", mp4: "video/mp4", ogv: "video/ogg", webm: "video/webm" });
export const AUDIO_FILE_EXTENSIONS = Object.freeze({ aac: "audio/aac", flac: "audio/flac", m4a: "audio/mp4", mid: "audio/midi", mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/opus", wav: "audio/wav", webm: "audio/webm" });

export function fileExtension(path: unknown): string {
  const clean = String(path ?? "").split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
}

const MAXIMUM_THUMBNAIL_SIDE = 1024;

interface ThumbnailOptions {
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
}

export class ImageHelper {
  static hasImageExtension(path: string): boolean {
    return fileExtension(path) in IMAGE_FILE_EXTENSIONS;
  }

  /** Scaled copy of an image or video frame as a data URL; `width`/`height` are capped to keep memory bounded. */
  static async createThumbnail(source: string | HTMLImageElement | HTMLVideoElement, { width = 200, height = 200, format = "image/webp", quality = 0.8 }: ThumbnailOptions = {}): Promise<{ thumb: string; width: number; height: number; src: string | null } | null> {
    const element = typeof source === "string" ? await ImageHelper.#loadImage(source) : source;
    if (!element) return null;
    const naturalWidth = "videoWidth" in element ? element.videoWidth : element.naturalWidth;
    const naturalHeight = "videoHeight" in element ? element.videoHeight : element.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;
    const targetWidth = Math.min(Math.max(Math.round(width), 1), MAXIMUM_THUMBNAIL_SIDE);
    const targetHeight = Math.min(Math.max(Math.round(height), 1), MAXIMUM_THUMBNAIL_SIDE);
    const scale = Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight, 1);
    const canvasElement = document.createElement("canvas");
    canvasElement.width = Math.max(1, Math.round(naturalWidth * scale));
    canvasElement.height = Math.max(1, Math.round(naturalHeight * scale));
    canvasElement.getContext("2d")?.drawImage(element, 0, 0, canvasElement.width, canvasElement.height);
    return { thumb: canvasElement.toDataURL(format, quality), width: canvasElement.width, height: canvasElement.height, src: typeof source === "string" ? source : null };
  }

  static #loadImage(source: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }
}

export class VideoHelper {
  static #instance: VideoHelper | null = null;

  static getInstance(): VideoHelper {
    VideoHelper.#instance ??= new VideoHelper();
    return VideoHelper.#instance;
  }

  static hasVideoExtension(path: string): boolean {
    return fileExtension(path) in VIDEO_FILE_EXTENSIONS;
  }

  async play(video: HTMLVideoElement, { volume = 0, loop = true }: { volume?: number; loop?: boolean } = {}): Promise<void> {
    video.volume = Math.min(Math.max(volume, 0), 1);
    video.loop = loop;
    await video.play().catch(() => undefined);
  }
}

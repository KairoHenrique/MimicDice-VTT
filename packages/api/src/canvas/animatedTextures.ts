import * as PIXI from "pixi.js";

const MAX_FRAMES = 300;
const MAX_SIDE_PX = 2048;
const MIN_FRAME_MS = 20;
const DEFAULT_FRAME_MS = 100;

interface DecodedFrame {
  bitmap: ImageBitmap;
  durationMs: number;
}

interface FrameDecoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}

type FrameDecoderClass = new (init: { data: ArrayBuffer; type: string }) => FrameDecoder;

export function isGifPath(path: string): boolean {
  return /^data:image\/gif/i.test(path) || /\.gif$/i.test(path.split(/[?#]/, 1)[0] ?? "");
}

function frameDecoderClass(): FrameDecoderClass | null {
  return ((globalThis as Record<string, unknown>).ImageDecoder as FrameDecoderClass | undefined) ?? null;
}

async function decodeFrames(path: string): Promise<DecodedFrame[] | null> {
  const Decoder = frameDecoderClass();
  if (!Decoder) return null;
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) return null;
  const decoder = new Decoder({ data: await response.arrayBuffer(), type: "image/gif" });
  try {
    await decoder.tracks.ready;
    const count = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 0, MAX_FRAMES);
    if (count < 2) return null;
    const frames: DecodedFrame[] = [];
    for (let frameIndex = 0; frameIndex < count; frameIndex += 1) {
      const { image } = await decoder.decode({ frameIndex });
      if (image.displayWidth > MAX_SIDE_PX || image.displayHeight > MAX_SIDE_PX) {
        image.close();
        return null;
      }
      const durationMs = image.duration ? image.duration / 1000 : DEFAULT_FRAME_MS;
      frames.push({ bitmap: await createImageBitmap(image), durationMs: Math.max(MIN_FRAME_MS, durationMs) });
      image.close();
    }
    return frames;
  } finally {
    decoder.close();
  }
}

/** One canvas per GIF, redrawn by the shared ticker; every sprite using the texture animates in step. */
function animate(frames: DecodedFrame[]): PIXI.Texture {
  const first = frames[0]!.bitmap;
  const surface = document.createElement("canvas");
  surface.width = first.width;
  surface.height = first.height;
  const context = surface.getContext("2d");
  const texture = PIXI.Texture.from(surface);
  if (!context) return texture;
  let frameIndex = 0;
  let elapsedMs = 0;
  const draw = () => {
    context.clearRect(0, 0, surface.width, surface.height);
    context.drawImage(frames[frameIndex]!.bitmap, 0, 0);
    texture.baseTexture.update();
  };
  draw();
  const tick = () => {
    if (texture.baseTexture.destroyed) {
      PIXI.Ticker.shared.remove(tick);
      for (const frame of frames) frame.bitmap.close();
      return;
    }
    elapsedMs += PIXI.Ticker.shared.deltaMS;
    let advanced = false;
    while (elapsedMs >= frames[frameIndex]!.durationMs) {
      elapsedMs -= frames[frameIndex]!.durationMs;
      frameIndex = (frameIndex + 1) % frames.length;
      advanced = true;
    }
    if (advanced) draw();
  };
  PIXI.Ticker.shared.add(tick);
  return texture;
}

/** An animated texture for a multi-frame GIF, or null to fall back to the static first frame. */
export async function loadAnimatedGif(path: string): Promise<PIXI.Texture | null> {
  try {
    const frames = await decodeFrames(path);
    return frames ? animate(frames) : null;
  } catch {
    return null;
  }
}

/** Videos used as images play silently on a loop, like an animated picture. */
export function loopVideoTexture(texture: PIXI.Texture): PIXI.Texture {
  const source = (texture.baseTexture.resource as { source?: unknown } | undefined)?.source;
  if (source instanceof HTMLVideoElement) {
    source.muted = true;
    source.loop = true;
    source.playsInline = true;
    void source.play().catch(() => undefined);
  }
  return texture;
}

import type { InlineIcon, MediaAsset } from "./types.ts";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i;

export function isSupportedFile(file: File): boolean {
  return (
    file.type.startsWith("image/") || file.type.startsWith("video/") || VIDEO_EXT.test(file.name) || IMAGE_EXT.test(file.name)
  );
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error("That image couldn't be decoded.");
  }
  return image;
}

async function decodeVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    // `loadeddata` guarantees a first frame is drawable, not just the dimensions.
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("That video format isn't supported by this browser.")), {
      once: true,
    });
  });
  await resolveDuration(video);
  await video.play().catch(() => undefined);
  return video;
}

/**
 * WebM files written by MediaRecorder (screen recorders, other meme tools) often report an
 * Infinity duration until the whole file has been scanned. Seeking far past the end forces it.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration)) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("durationchange", onChange);
      resolve();
    };
    const onChange = () => {
      if (Number.isFinite(video.duration)) done();
    };
    const timer = setTimeout(done, 3000);
    video.addEventListener("durationchange", onChange);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
  video.currentTime = 0;
}

export async function loadMediaFile(file: File): Promise<MediaAsset> {
  if (!isSupportedFile(file)) throw new Error(`“${file.name}” isn't an image or video.`);
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/") || VIDEO_EXT.test(file.name)) {
      const video = await decodeVideo(url);
      return { kind: "video", source: video, name: file.name, width: video.videoWidth, height: video.videoHeight, url };
    }
    const image = await decodeImage(url);
    return { kind: "image", source: image, name: file.name, width: image.naturalWidth, height: image.naturalHeight, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function loadMediaUrl(url: string, name: string): Promise<MediaAsset> {
  const image = await decodeImage(url);
  return { kind: "image", source: image, name, width: image.naturalWidth, height: image.naturalHeight, url };
}

export function disposeMedia(media: MediaAsset): void {
  if (media.source instanceof HTMLVideoElement) {
    media.source.pause();
    media.source.removeAttribute("src");
    media.source.load();
  }
  if (media.url.startsWith("blob:")) URL.revokeObjectURL(media.url);
}

function slug(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "icon"
  );
}

export async function loadIconFile(file: File, taken: (id: string) => boolean): Promise<InlineIcon> {
  if (!file.type.startsWith("image/") && !IMAGE_EXT.test(file.name)) {
    throw new Error(`“${file.name}” isn't an image.`);
  }
  const src = URL.createObjectURL(file);
  try {
    const image = await decodeImage(src);
    const base = slug(file.name);
    let id = base;
    for (let n = 2; taken(id); n++) id = `${base}-${n}`;
    return { id, label: file.name.replace(/\.[^.]+$/, ""), src, image, custom: true };
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  }
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "meme";
}

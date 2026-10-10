/**
 * Client-side image compression utility
 * Optimized for fast WhatsApp uploads
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  maxSizeMB?: number;
  outputType?: 'image/jpeg' | 'image/webp' | 'image/png';
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.7,
  maxSizeMB: 0.8,     // Aggressive target for faster uploads
  outputType: 'image/webp',
};

function calculateDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
  wasCompressed: boolean;
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;
  const maxSizeBytes = (opts.maxSizeMB || 0.8) * 1024 * 1024;

  // Skip non-images and GIFs
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { file, originalSize, compressedSize: originalSize, compressionRatio: 1, width: 0, height: 0, wasCompressed: false };
  }

  // Use createImageBitmap for faster decoding (no DOM, hardware-accelerated)
  let imgWidth: number;
  let imgHeight: number;
  let source: ImageBitmap | HTMLImageElement;

  if (typeof createImageBitmap !== 'undefined') {
    source = await createImageBitmap(file);
    imgWidth = source.width;
    imgHeight = source.height;
  } else {
    // Fallback for older browsers
    source = await loadImageFallback(file);
    imgWidth = source.naturalWidth;
    imgHeight = source.naturalHeight;
  }

  const { width, height } = calculateDimensions(
    imgWidth, imgHeight,
    opts.maxWidth || 1280, opts.maxHeight || 1280
  );

  // Skip if already small enough and no resize needed
  if (originalSize <= maxSizeBytes && width === imgWidth && height === imgHeight) {
    if ('close' in source) source.close();
    return { file, originalSize, compressedSize: originalSize, compressionRatio: 1, width, height, wasCompressed: false };
  }

  let outputType = opts.outputType || 'image/webp';
  let blob: Blob;

  // Prefer OffscreenCanvas (non-blocking, Web Worker compatible)
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(source, 0, 0, width, height);

    // Single compression pass with target quality
    blob = await offscreen.convertToBlob({ type: outputType, quality: opts.quality || 0.7 });

    // One retry at lower quality if too large
    if (blob.size > maxSizeBytes) {
      blob = await offscreen.convertToBlob({ type: outputType, quality: 0.5 });
    }

    // Final fallback to JPEG
    if (blob.size > maxSizeBytes && outputType === 'image/webp') {
      outputType = 'image/jpeg';
      blob = await offscreen.convertToBlob({ type: outputType, quality: 0.5 });
    }
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, width, height);

    blob = await canvasToBlob(canvas, outputType, opts.quality || 0.7);

    if (blob.size > maxSizeBytes) {
      blob = await canvasToBlob(canvas, outputType, 0.5);
    }

    if (blob.size > maxSizeBytes && outputType === 'image/webp') {
      outputType = 'image/jpeg';
      blob = await canvasToBlob(canvas, outputType, 0.5);
    }
  }

  // Clean up ImageBitmap
  if ('close' in source) source.close();

  const ext = outputType === 'image/webp' ? 'webp' : outputType === 'image/png' ? 'png' : 'jpg';
  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, `.${ext}`),
    { type: outputType }
  );

  return {
    file: compressedFile,
    originalSize,
    compressedSize: compressedFile.size,
    compressionRatio: compressedFile.size / originalSize,
    width,
    height,
    wasCompressed: true,
  };
}

function loadImageFallback(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas toBlob failed')); },
      type, quality
    );
  });
}

export function createImagePreview(file: File): string | null {
  if (!file.type.startsWith('image/')) return null;
  return URL.createObjectURL(file);
}

export function formatCompressionInfo(originalSize: number, compressedSize: number): string {
  const savedPercent = Math.round(((originalSize - compressedSize) / originalSize) * 100);
  const fmt = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
  return `${fmt(originalSize)} → ${fmt(compressedSize)} (-${savedPercent}%)`;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compressImage,
  createImagePreview,
  formatCompressionInfo,
} from '@/utils/imageCompression';

// Testes do código REAL: exercitam o módulo de produção.
// compressImage só lê name/type/size antes de tocar em APIs de canvas, então
// um objeto com esses campos cobre os caminhos que não exigem decodificação real.
const makeFile = (name: string, type: string, sizeBytes: number): File =>
  ({ name, type, size: sizeBytes } as unknown as File);

const MB = 1024 * 1024;

describe('imageCompression — compressImage', () => {
  it('ignora arquivo que não é imagem', async () => {
    const pdf = makeFile('relatorio.pdf', 'application/pdf', 2 * MB);
    const result = await compressImage(pdf);
    expect(result.file).toBe(pdf);
    expect(result.wasCompressed).toBe(false);
    expect(result.compressionRatio).toBe(1);
    expect(result.originalSize).toBe(2 * MB);
    expect(result.compressedSize).toBe(2 * MB);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('ignora GIF', async () => {
    const gif = makeFile('anim.gif', 'image/gif', 3 * MB);
    const result = await compressImage(gif);
    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(gif);
  });
});

describe('imageCompression — compressImage (imagem já pequena)', () => {
  const close = vi.fn();
  const bitmap = { width: 100, height: 100, close };

  beforeEach(() => {
    close.mockClear();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não recomprime imagem pequena e dentro das dimensões máximas', async () => {
    const foto = makeFile('foto.jpg', 'image/jpeg', 100 * 1024);
    const result = await compressImage(foto);
    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(foto);
    expect(result.compressionRatio).toBe(1);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(close).toHaveBeenCalled(); // ImageBitmap liberado
  });
});

describe('imageCompression — createImagePreview', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve null para arquivo que não é imagem', () => {
    expect(createImagePreview(makeFile('a.pdf', 'application/pdf', 10))).toBeNull();
  });

  it('devolve uma URL de objeto para imagem', () => {
    expect(createImagePreview(makeFile('a.png', 'image/png', 10))).toBe('blob:preview');
  });
});

describe('imageCompression — formatCompressionInfo', () => {
  it('formata bytes com o percentual economizado', () => {
    expect(formatCompressionInfo(1000, 500)).toBe('1000B → 500B (-50%)');
  });

  it('formata megabytes e kilobytes', () => {
    expect(formatCompressionInfo(MB, 512 * 1024)).toBe('1.0MB → 512.0KB (-50%)');
  });
});

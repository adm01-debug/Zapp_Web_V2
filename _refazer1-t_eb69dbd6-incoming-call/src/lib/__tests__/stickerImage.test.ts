/**
 * Item 069 (SL-210) — unidade da conversão de figurinha para WebP.
 *
 * Aqui se prova o contrato da lib: o que é convertido, o que passa intacto e o
 * que acontece quando o navegador não converte (o arquivo original segue — a
 * figurinha não pode deixar de subir por causa da conversão) e quando o
 * navegador devolve PNG mesmo sendo pedido WebP (nada de objeto rotulado
 * errado). O caminho ponta a ponta (o que chega ao bucket) está em
 * `src/hooks/sticker-picker/__tests__/useStickerPicker.webp.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const logStub = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock('@/lib/logger', () => ({ getLogger: () => logStub, log: logStub, logger: logStub }));

import {
  converterFigurinhaParaWebp,
  dimensoesDaFigurinha,
  nomeComExtensaoWebp,
  precisaConverterParaWebp,
  STICKER_WEBP_TYPE,
} from '../stickerImage';

function arquivo(nome: string, tipo: string, bytes = 'bytes'): File {
  return new File([bytes], nome, { type: tipo });
}

/** `createImageBitmap` + `OffscreenCanvas` no lugar (jsdom não tem nenhum dos dois). */
function instalarNavegadorDeImagem(opcoes: { largura?: number; altura?: number; tipoCodificado?: string } = {}) {
  const codificar = vi.fn((o: { type?: string }, _largura: number, _altura: number) =>
    Promise.resolve(new Blob(['webp'], { type: o.type })),
  );
  const decodificar = vi.fn(() =>
    Promise.resolve({ width: opcoes.largura ?? 300, height: opcoes.altura ?? 300, close: vi.fn() }),
  );
  vi.stubGlobal('createImageBitmap', decodificar);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob(o: { type?: string; quality?: number }) {
        if (opcoes.tipoCodificado && o.type) return Promise.resolve(new Blob(['x'], { type: opcoes.tipoCodificado }));
        return codificar(o, this.width, this.height);
      }
    },
  );
  return { codificar, decodificar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stickerImage — decisão de conversão', () => {
  it('PNG e JPEG precisam de conversão; WebP e GIF não', () => {
    expect(precisaConverterParaWebp(arquivo('a.png', 'image/png'))).toBe(true);
    expect(precisaConverterParaWebp(arquivo('a.jpeg', 'image/jpeg'))).toBe(true);
    expect(precisaConverterParaWebp(arquivo('a.webp', 'image/webp'))).toBe(false);
    // GIF fica de fora: o canvas devolveria só o primeiro quadro.
    expect(precisaConverterParaWebp(arquivo('a.gif', 'image/gif'))).toBe(false);
    expect(precisaConverterParaWebp(arquivo('a.pdf', 'application/pdf'))).toBe(false);
  });

  it('nome ganha a extensão .webp sem duplicar o ponto', () => {
    expect(nomeComExtensaoWebp('figurinha.PNG')).toBe('figurinha.webp');
    expect(nomeComExtensaoWebp('foto com espaço.jpeg')).toBe('foto com espaço.webp');
    expect(nomeComExtensaoWebp('sem-extensao')).toBe('sem-extensao.webp');
    expect(nomeComExtensaoWebp('a.b.gif')).toBe('a.b.webp');
  });

  it('dimensões só encolhem, preservando a proporção e o lado máximo', () => {
    expect(dimensoesDaFigurinha(300, 200)).toEqual({ width: 300, height: 200 });
    expect(dimensoesDaFigurinha(1024, 512)).toEqual({ width: 512, height: 256 });
    expect(dimensoesDaFigurinha(200, 2000)).toEqual({ width: 51, height: 512 });
    expect(dimensoesDaFigurinha(600, 600, 512)).toEqual({ width: 512, height: 512 });
  });
});

describe('stickerImage — conversão', () => {
  it('PNG vira File image/webp com nome .webp', async () => {
    const { codificar, decodificar } = instalarNavegadorDeImagem({ largura: 1200, altura: 600 });
    const convertido = await converterFigurinhaParaWebp(arquivo('figurinha.png', 'image/png'));

    expect(decodificar).toHaveBeenCalledTimes(1);
    expect(convertido.name).toBe('figurinha.webp');
    expect(convertido.type).toBe(STICKER_WEBP_TYPE);
    // Lado máximo da figurinha respeitado no encode.
    expect(codificar.mock.calls[0][0]).toMatchObject({ type: STICKER_WEBP_TYPE });
    expect(codificar.mock.calls[0].slice(1)).toEqual([512, 256]);
  });

  it('WebP e GIF sobem como vieram, sem passar pelo decode', async () => {
    const { decodificar } = instalarNavegadorDeImagem();

    const webp = arquivo('pronta.webp', 'image/webp');
    expect(await converterFigurinhaParaWebp(webp)).toBe(webp);

    const gif = arquivo('animada.gif', 'image/gif');
    expect(await converterFigurinhaParaWebp(gif)).toBe(gif);

    expect(decodificar).not.toHaveBeenCalled();
  });

  it('sem createImageBitmap o arquivo original segue (conversão não bloqueia o upload)', async () => {
    const png = arquivo('figurinha.png', 'image/png');
    expect(typeof createImageBitmap).toBe('undefined');
    expect(await converterFigurinhaParaWebp(png)).toBe(png);
    expect(logStub.error).not.toHaveBeenCalled();
  });

  it('navegador que devolve PNG no lugar de WebP: fica o arquivo original, sem rótulo errado', async () => {
    instalarNavegadorDeImagem({ tipoCodificado: 'image/png' });
    const png = arquivo('figurinha.png', 'image/png');
    expect(await converterFigurinhaParaWebp(png)).toBe(png);
  });

  it('imagem sem dimensão decodificável: fica o original', async () => {
    instalarNavegadorDeImagem({ largura: 0, altura: 0 });
    const png = arquivo('figurinha.png', 'image/png');
    expect(await converterFigurinhaParaWebp(png)).toBe(png);
  });

  it('falha no decode é registrada e devolve o original (não é engolida em silêncio)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode falhou')));
    const png = arquivo('figurinha.png', 'image/png');

    await expect(converterFigurinhaParaWebp(png)).resolves.toBe(png);
    expect(logStub.error).toHaveBeenCalledTimes(1);
  });
});

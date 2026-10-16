import { describe, it, expect } from 'vitest';
import { validateFile, validateFileContent, detectFileSignature } from '../whatsappFileTypes';

// A assinatura de conteúdo (U8) compara os primeiros 16 bytes com a categoria DECLARADA.
// O tipo declarado é forjável (nome/MIME), então os casos-chave são "conteúdo diferente do
// tipo informado" (recusa) e "formatos legítimos de áudio/vídeo" (não recusar por engano).
const bytes = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52],
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01],
  webp: [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20],
  zip: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ogg: [0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  mp3: [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  // `.exe` (MZ/PE) — nunca é anexo válido do WhatsApp.
  exe: [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00],
  // ISO BMFF: `ftyp` + marca. M4A é áudio; 3gp é vídeo (a marca decide, não o `ftyp`).
  m4a: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x00, 0x00],
  threeGp: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x33, 0x67, 0x70, 0x34, 0x00, 0x00, 0x00, 0x00],
  mp4: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00],
  // EBML/WebM — vale para vídeo e para áudio (voz gravada no navegador).
  webm: [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f, 0x42, 0x86, 0x81, 0x01],
  texto: [0x6e, 0x6f, 0x74, 0x61, 0x73, 0x20, 0x64, 0x6f, 0x20, 0x64, 0x69, 0x61, 0x0a, 0x6f, 0x6b, 0x0a],
};

const file = (data: number[], name: string, type: string) => new File([new Uint8Array(data)], name, { type });

describe('validateFile (regra declarada: MIME/extensão/tamanho)', () => {
  it('aceita pdf dentro do limite', () => {
    const result = validateFile(file(bytes.pdf, 'contrato.pdf', 'application/pdf'));
    expect(result.valid).toBe(true);
    expect(result.category).toBe('document');
  });

  it('recusa tipo não suportado e gif', () => {
    expect(validateFile(file(bytes.png, 'anim.gif', 'image/gif')).valid).toBe(false);
    expect(validateFile(file([0x4d, 0x5a], 'programa.exe', 'application/x-msdownload')).valid).toBe(false);
  });

  it('recusa imagem acima de 16 MB', () => {
    const big = new File([new Uint8Array(17 * 1024 * 1024)], 'foto.png', { type: 'image/png' });
    const result = validateFile(big);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('16MB');
  });
});

describe('detectFileSignature (primeiros bytes)', () => {
  it('reconhece as assinaturas da tabela', () => {
    expect(detectFileSignature(new Uint8Array(bytes.pdf))?.family).toBe('pdf');
    expect(detectFileSignature(new Uint8Array(bytes.png))?.family).toBe('png');
    expect(detectFileSignature(new Uint8Array(bytes.exe))?.family).toBe('executável');
    expect(detectFileSignature(new Uint8Array(bytes.m4a))?.family).toBe('m4a');
    expect(detectFileSignature(new Uint8Array(bytes.threeGp))?.family).toBe('3gp');
    expect(detectFileSignature(new Uint8Array(bytes.webm))?.family).toBe('webm');
  });

  it('separa m4a (áudio) de 3gp (vídeo) pela marca do ftyp', () => {
    expect(detectFileSignature(new Uint8Array(bytes.m4a))?.categories).toEqual(['audio']);
    expect(detectFileSignature(new Uint8Array(bytes.threeGp))?.categories).toEqual(['video']);
  });

  it('devolve null para conteúdo sem assinatura conhecida (texto)', () => {
    expect(detectFileSignature(new Uint8Array(bytes.texto))).toBeNull();
  });
});

describe('validateFileContent (conteúdo x tipo declarado)', () => {
  it('recusa .exe renomeado .pdf', async () => {
    const result = await validateFileContent(file(bytes.exe, 'contrato.pdf', 'application/pdf'));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('conteúdo não corresponde');
  });

  it('recusa png com nome/mime de pdf', async () => {
    const result = await validateFileContent(file(bytes.png, 'documento.pdf', 'application/pdf'));
    expect(result.valid).toBe(false);
  });

  it('aceita .m4a e .3gp legítimos', async () => {
    expect((await validateFileContent(file(bytes.m4a, 'voz.m4a', 'audio/mp4'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.threeGp, 'clipe.3gp', 'video/3gpp'))).valid).toBe(true);
  });

  it('aceita webm (EBML) como áudio e como vídeo, sem tratá-lo como mp4', async () => {
    expect((await validateFileContent(file(bytes.webm, 'voz.webm', 'audio/webm'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.webm, 'clipe.webm', 'video/webm'))).valid).toBe(true);
  });

  it('aceita mp4, jpeg, webp, ogg, mp3, zip e pdf com o tipo coerente', async () => {
    expect((await validateFileContent(file(bytes.mp4, 'video.mp4', 'video/mp4'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.jpeg, 'foto.jpg', 'image/jpeg'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.webp, 'figura.webp', 'image/webp'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.ogg, 'nota.ogg', 'audio/ogg'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.mp3, 'musica.mp3', 'audio/mpeg'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.zip, 'planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).valid).toBe(true);
    expect((await validateFileContent(file(bytes.pdf, 'contrato.pdf', 'application/pdf'))).valid).toBe(true);
  });

  it('deixa passar conteúdo sem assinatura confiável (texto) — item 2 do cartão', async () => {
    expect((await validateFileContent(file(bytes.texto, 'notas.txt', 'text/plain'))).valid).toBe(true);
    // Sem assinatura conhecida também não bloqueia (a regra declarada é quem decide).
    expect((await validateFileContent(file([0x78, 0x78, 0x78], 'qualquer.pdf', 'application/pdf'))).valid).toBe(true);
    expect((await validateFileContent(file([], 'vazio.pdf', 'application/pdf'))).valid).toBe(true);
  });
});

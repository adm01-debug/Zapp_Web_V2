import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_FILE_TYPES,
  getAllowedExtensions,
  getAllowedMimeTypes,
  getFileInputAccept,
  validateFile,
  formatFileSize,
  getFileCategory,
  getMaxSizeForCategory,
  getFileExtension,
  getFileNameFromUrl,
  getContactTypeInfo,
  CONTACT_TYPES,
} from '@/utils/whatsappFileTypes';

// Testes do código REAL: importam o módulo de produção (sem espelho local).
// validateFile só lê name/type/size, então um objeto com esses campos basta e
// evita alocar 16 MB de bytes por caso.
const makeFile = (name: string, type: string, sizeBytes: number): File =>
  ({ name, type, size: sizeBytes } as unknown as File);

const MB = 1024 * 1024;

describe('whatsappFileTypes — constantes do módulo', () => {
  it('cobre as cinco categorias com extensões e MIME types', () => {
    const keys = Object.keys(WHATSAPP_FILE_TYPES).sort();
    expect(keys).toEqual(['audio', 'document', 'image', 'sticker', 'video']);
    for (const config of Object.values(WHATSAPP_FILE_TYPES)) {
      expect(config.extensions.length).toBeGreaterThan(0);
      expect(config.mimeTypes.length).toBeGreaterThan(0);
      expect(config.maxSizeMB).toBeGreaterThan(0);
    }
  });

  it('mantém os limites oficiais por categoria', () => {
    expect(WHATSAPP_FILE_TYPES.image.maxSizeMB).toBe(16);
    expect(WHATSAPP_FILE_TYPES.video.maxSizeMB).toBe(16);
    expect(WHATSAPP_FILE_TYPES.audio.maxSizeMB).toBe(16);
    expect(WHATSAPP_FILE_TYPES.document.maxSizeMB).toBe(100);
    expect(WHATSAPP_FILE_TYPES.sticker.maxSizeMB).toBe(0.5);
  });
});

describe('whatsappFileTypes — listas derivadas', () => {
  it('getAllowedExtensions junta as extensões e não inclui formatos perigosos', () => {
    const exts = getAllowedExtensions();
    expect(exts).toContain('.jpg');
    expect(exts).toContain('.pdf');
    expect(exts).toContain('.mp3');
    expect(exts).not.toContain('.exe');
  });

  it('getAllowedMimeTypes junta os MIME types e não inclui executáveis', () => {
    const mimes = getAllowedMimeTypes();
    expect(mimes).toContain('image/jpeg');
    expect(mimes).toContain('application/pdf');
    expect(mimes).not.toContain('application/x-msdos-program');
    expect(mimes).not.toContain('text/javascript');
  });

  it('getFileInputAccept é a lista de MIME types separada por vírgula', () => {
    expect(getFileInputAccept()).toBe(getAllowedMimeTypes().join(','));
    expect(getFileInputAccept()).toContain('image/jpeg');
  });
});

describe('whatsappFileTypes — validateFile', () => {
  it('imagem dentro do limite de 16MB é aceita', () => {
    const result = validateFile(makeFile('foto.jpg', 'image/jpeg', 15 * MB));
    expect(result.valid).toBe(true);
    expect(result.category).toBe('image');
    expect(result.maxSizeMB).toBe(16);
    expect(result.error).toBeUndefined();
  });

  it('imagem acima de 16MB é recusada com o limite no texto', () => {
    const result = validateFile(makeFile('foto.jpg', 'image/jpeg', 17 * MB));
    expect(result.valid).toBe(false);
    expect(result.category).toBe('image');
    expect(result.maxSizeMB).toBe(16);
    expect(result.error).toContain('16MB');
    expect(result.error).toContain('imagem');
  });

  it('documento dentro de 100MB é aceito e acima é recusado', () => {
    expect(validateFile(makeFile('relatorio.pdf', 'application/pdf', 50 * MB)).valid).toBe(true);
    const grande = validateFile(makeFile('relatorio.pdf', 'application/pdf', 120 * MB));
    expect(grande.valid).toBe(false);
    expect(grande.category).toBe('document');
    expect(grande.error).toContain('100MB');
  });

  it('reconhece pela extensão quando o MIME vem vazio ou é estranho', () => {
    const vazio = validateFile(makeFile('contrato.pdf', '', 1 * MB));
    expect(vazio.valid).toBe(true);
    expect(vazio.category).toBe('document');
    // DEFEITO: a validação aceita por extensão sozinha, então um arquivo
    // renomeado (.exe -> .pdf) passa com qualquer MIME.
    const mimeEstranho = validateFile(makeFile('contrato.pdf', 'application/octet-stream', 1 * MB));
    expect(mimeEstranho.valid).toBe(true);
    expect(mimeEstranho.category).toBe('document');
  });

  it('recusa formato não suportado citando o tipo', () => {
    const result = validateFile(makeFile('virus.exe', 'application/x-msdos-program', 1 * MB));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Tipo de arquivo não suportado');
    expect(result.category).toBeUndefined();
  });

  it('recusa script disfarçado de texto puro', () => {
    const result = validateFile(makeFile('payload.js', 'text/javascript', 1 * MB));
    expect(result.valid).toBe(false);
  });

  it('webp casa a categoria imagem antes de sticker (primeira config vence)', () => {
    // Ordem do WHATSAPP_FILE_TYPES: image vem antes de sticker, então image/webp
    // é classificado como imagem (limite 16MB) e o limite de 0.5MB do sticker
    // não se aplica a este caminho.
    const result = validateFile(makeFile('figurinha.webp', 'image/webp', 1 * MB));
    expect(result.valid).toBe(true);
    expect(result.category).toBe('image');
  });
});

describe('whatsappFileTypes — helpers', () => {
  it('formatFileSize formata B, KB e MB', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(MB)).toBe('1.00 MB');
  });

  it('getFileCategory devolve a categoria por MIME e cai no prefixo quando desconhecido', () => {
    expect(getFileCategory('image/png')).toBe('image');
    expect(getFileCategory('video/mp4')).toBe('video');
    expect(getFileCategory('audio/ogg')).toBe('audio');
    expect(getFileCategory('application/pdf')).toBe('document');
    expect(getFileCategory('image/bmp')).toBe('image'); // fallback por prefixo
    expect(getFileCategory('application/x-executable')).toBe('document'); // fallback por prefixo
    expect(getFileCategory('foo/bar')).toBeNull();
  });

  it('getMaxSizeForCategory devolve o limite de cada categoria', () => {
    expect(getMaxSizeForCategory('image')).toBe(16);
    expect(getMaxSizeForCategory('video')).toBe(16);
    expect(getMaxSizeForCategory('audio')).toBe(16);
    expect(getMaxSizeForCategory('document')).toBe(100);
    expect(getMaxSizeForCategory('sticker')).toBe(0.5);
  });

  it('getFileExtension extrai a última extensão e devolve vazio quando não há', () => {
    expect(getFileExtension('arquivo.pdf')).toBe('pdf');
    expect(getFileExtension('a.b.docx')).toBe('docx');
    expect(getFileExtension('semextensao')).toBe('');
    expect(getFileExtension('trailing.')).toBe('');
  });

  it('getFileNameFromUrl extrai o nome e cai em "file" quando a URL é inválida', () => {
    expect(getFileNameFromUrl('https://exemplo.com/pasta/foto.png')).toBe('foto.png');
    expect(getFileNameFromUrl('nao-e-url')).toBe('file');
  });

  it('getContactTypeInfo devolve o tipo pedido e cai no primeiro quando não existe', () => {
    expect(getContactTypeInfo('cliente').label).toBe('Cliente');
    expect(getContactTypeInfo('inexistente').value).toBe(CONTACT_TYPES[0].value);
  });

  it('CONTACT_TYPES expõe os seis tipos com rótulo e cor', () => {
    expect(CONTACT_TYPES).toHaveLength(6);
    expect(CONTACT_TYPES.map(t => t.value)).toContain('prestador_servico');
    for (const t of CONTACT_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.color.length).toBeGreaterThan(0);
    }
  });
});

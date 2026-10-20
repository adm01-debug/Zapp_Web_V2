import { describe, it, expect } from 'vitest';
import { formatFileDate, formatMeta, formatSize } from '../fileDisplay';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

const BASE: ContactMediaItem = {
  id: 'm1', url: 'https://x/a.jpg', type: 'image', filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png', extension: 'png', senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z', caption: null, mimetype: 'image/png',
  size: 1200000, meta: null, sender: 'agent',
};

describe('fileDisplay (etapa 25)', () => {
  it('formatMeta junta "Tipo · tamanho · data" e usa o mesmo formatador de data da Tabela', () => {
    expect(formatMeta(BASE)).toBe(`Imagem · 1.1 MB · ${formatFileDate(BASE.created_at)}`);
  });

  it('formatMeta omite o tamanho ausente — nunca "0 KB" nem separador duplicado', () => {
    const meta = formatMeta({ ...BASE, size: null });
    expect(meta).toBe(`Imagem · ${formatFileDate(BASE.created_at)}`);
    expect(meta).not.toMatch(/null|0 KB|·\s*·/);
  });

  it('formatSize devolve null para ausente/zero e formata B/KB/MB', () => {
    expect(formatSize(null)).toBeNull();
    expect(formatSize(0)).toBeNull();
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(1200000)).toBe('1.1 MB');
  });
});

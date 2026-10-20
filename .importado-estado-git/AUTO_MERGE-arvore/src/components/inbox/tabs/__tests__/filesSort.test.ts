import { describe, it, expect } from 'vitest';
import { filterMediaItems, sortMediaItems } from '@/components/inbox/tabs/filesSort';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

function item(overrides: Partial<ContactMediaItem> & { id: string }): ContactMediaItem {
  return {
    url: `https://x/${overrides.id}.jpg`,
    type: 'image',
    filename: `${overrides.id}.jpg`,
    displayName: `${overrides.id}.jpg`,
    extension: 'jpg',
    senderLabel: null,
    created_at: '2026-01-01T10:00:00.000Z',
    caption: null,
    mimetype: 'image/jpeg',
    size: 1000,
    meta: null,
    sender: 'contact',
    ...overrides,
  };
}

describe('filesSort — ordenacao (etapas 23 e 43)', () => {
  it('"Maiores" poe tamanho conhecido em ordem decrescente e o desconhecido NO FIM (nunca como 0)', () => {
    const items = [
      item({ id: 'a', size: 500 }),
      item({ id: 'b', size: null }),
      item({ id: 'c', size: 4096 }),
      item({ id: 'd', size: null }),
    ];
    const ids = sortMediaItems(items, 'biggest').map((i) => i.id);
    expect(ids.slice(0, 2)).toEqual(['c', 'a']);
    expect(new Set(ids.slice(2))).toEqual(new Set(['b', 'd'])); // desconhecidos depois
  });

  it('"Maiores" desempata por data e id', () => {
    const items = [
      item({ id: 'z', size: 100, created_at: '2026-01-01T10:00:00.000Z' }),
      item({ id: 'y', size: 100, created_at: '2026-01-02T10:00:00.000Z' }),
      item({ id: 'x', size: 100, created_at: '2026-01-02T10:00:00.000Z' }),
    ];
    // mesmo tamanho: data desc primeiro (y e x, 02/01), depois id desc (y > x)
    expect(sortMediaItems(items, 'biggest').map((i) => i.id)).toEqual(['y', 'x', 'z']);
  });

  it('"Mais recentes" e "Mais antigos" sao espelhos e desempatam por id', () => {
    const items = [
      item({ id: 'a', created_at: '2026-01-03T10:00:00.000Z' }),
      item({ id: 'b', created_at: '2026-01-01T10:00:00.000Z' }),
      item({ id: 'c', created_at: '2026-01-03T10:00:00.000Z' }),
    ];
    expect(sortMediaItems(items, 'recent').map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(sortMediaItems(items, 'old').map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('"Nome (A–Z)" ordena por displayName', () => {
    const items = [item({ id: 'a', displayName: 'zebra.png' }), item({ id: 'b', displayName: 'alface.png' })];
    expect(sortMediaItems(items, 'alpha').map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('nao muta a lista recebida', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    const before = items.map((i) => i.id);
    sortMediaItems(items, 'alpha');
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('filesSort — filtro', () => {
  it('filtra por tipo e por busca no nome/caption', () => {
    const items = [
      item({ id: 'a', type: 'image', filename: 'foto-praia.jpg' }),
      item({ id: 'b', type: 'document', filename: 'contrato.pdf', caption: 'assinado' }),
      item({ id: 'c', type: 'video', filename: 'clip.mp4' }),
    ];
    expect(filterMediaItems(items, 'document', '').map((i) => i.id)).toEqual(['b']);
    expect(filterMediaItems(items, 'all', 'contrato').map((i) => i.id)).toEqual(['b']);
    expect(filterMediaItems(items, 'all', 'assinado').map((i) => i.id)).toEqual(['b']);
    expect(filterMediaItems(items, 'all', 'CLIP').map((i) => i.id)).toEqual(['c']);
  });
});

describe('filesSort — filtro por data (F02)', () => {
  const range = {
    from: new Date(2026, 2, 5, 0, 0, 0, 0).getTime(),
    to: new Date(2026, 2, 7, 23, 59, 59, 999).getTime(),
  };

  const items = [
    item({ id: 'dentro', type: 'document', filename: 'contrato-dentro.pdf', created_at: new Date(2026, 2, 6, 10, 0).toISOString() }),
    item({ id: 'fora', type: 'document', filename: 'contrato-fora.pdf', created_at: new Date(2026, 2, 20, 10, 0).toISOString() }),
  ];

  it('sem o 4º parâmetro o resultado é o de antes (as chamadas atuais não mudam)', () => {
    const esperado = ['dentro', 'fora'];
    expect(filterMediaItems(items, 'document', 'contrato').map((i) => i.id)).toEqual(esperado);
    expect(filterMediaItems(items, 'document', 'contrato', null).map((i) => i.id)).toEqual(esperado);
    expect(filterMediaItems(items, 'document', 'contrato', undefined).map((i) => i.id)).toEqual(esperado);
  });

  it('com o intervalo, combina o período com o tipo e a busca', () => {
    expect(filterMediaItems(items, 'document', 'contrato', range).map((i) => i.id)).toEqual(['dentro']);
    expect(filterMediaItems(items, 'image', '', range)).toEqual([]);
    expect(filterMediaItems(items, 'all', 'fora', range)).toEqual([]);
  });

  it('item sem data válida fica fora com período ativo e continua na lista sem período', () => {
    const semData = item({ id: 'sem-data', created_at: '' });
    expect(filterMediaItems([semData], 'all', '', range)).toEqual([]);
    expect(filterMediaItems([semData], 'all', '')).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cardName } from '@/components/inbox/tabs/fileDisplay';
import { filterMediaItems, sortMediaItems } from '@/components/inbox/tabs/filesSort';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * M06 — filtro "Figurinhas": classificação, contadores dos chips (Todos/Imagens/Figurinhas),
 * ordenação e busca preservadas.
 *
 * Só a FRONTEIRA é dublada: o cliente Supabase, aqui um BANCO FALSO que aplica exatamente os
 * filtros que o produto monta (`eq`/`not`/`or`/`in`) sobre linhas de `messages` de um fixture. Os
 * hooks e as funções de filtro/ordenação rodam de verdade — a contagem esperada vem das LINHAS do
 * fixture (fonte independente do código), não de um número copiado do produto.
 */

const STORAGE = 'https://test.supabase.co';

const spies = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => spies.from(...args),
    storage: { from: (...args: unknown[]) => spies.storageFrom(...args) },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

import { useContactMedia } from '@/hooks/chat/useContactMedia';
import { useContactMediaCounts } from '@/hooks/chat/useContactMediaCounts';

/** Linha de `messages` com as colunas que as consultas da aba pedem (mais `is_deleted`). */
interface LinhaFalsa {
  id: string;
  contact_id: string;
  media_url: string | null;
  message_type: string;
  media_type: string | null;
  media_mimetype: string | null;
  media_filename: string | null;
  media_size: number | null;
  media_meta: Record<string, unknown> | null;
  caption: string | null;
  content: string | null;
  sender: string | null;
  agent_id: string | null;
  ptt: boolean | null;
  is_deleted: boolean | null;
  created_at: string;
}

function linha(overrides: Partial<LinhaFalsa> & { id: string }): LinhaFalsa {
  return {
    contact_id: 'contato-1',
    media_url: `${STORAGE}/storage/v1/object/public/whatsapp-media/arquivos/${overrides.id}`,
    message_type: 'image',
    media_type: null,
    media_mimetype: null,
    media_filename: null,
    media_size: 2048,
    media_meta: null,
    caption: null,
    content: null,
    sender: 'contact',
    agent_id: null,
    ptt: false,
    is_deleted: false,
    created_at: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

/** Filtros `message_type` que o produto pediu — a prova de qual recorte cada chip consultou. */
const tiposPedidos: Array<{ coluna: string; valores: string[] }> = [];

/**
 * Construtor de consulta do banco falso: acumula os PREDICADOS que o produto mandou e só então
 * conta as linhas que passam por todos. `then` fecha tanto `count: exact, head: true` (chips)
 * quanto o `select` da lista.
 */
function consultaFalsa(
  linhas: LinhaFalsa[],
  predicados: Array<(l: LinhaFalsa) => boolean> = [],
  limite: number | null = null,
) {
  const resultado = () => {
    const encontradas = linhas.filter((l) => predicados.every((p) => p(l)));
    // Mesma ordem do `ORDER BY created_at desc, id desc` da consulta real.
    const ordenadas = [...encontradas].sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    );
    return {
      data: limite === null ? ordenadas : ordenadas.slice(0, limite),
      count: encontradas.length,
      error: null,
    };
  };

  return {
    eq: (coluna: keyof LinhaFalsa, valor: unknown) =>
      consultaFalsa(linhas, [...predicados, (l) => l[coluna] === valor], limite),
    in: (coluna: keyof LinhaFalsa, valores: string[]) => {
      tiposPedidos.push({ coluna: String(coluna), valores });
      return consultaFalsa(linhas, [...predicados, (l) => valores.includes(String(l[coluna]))], limite);
    },
    not: (coluna: keyof LinhaFalsa, _operador: string, _valor: null) =>
      consultaFalsa(linhas, [...predicados, (l) => l[coluna] !== null && l[coluna] !== undefined], limite),
    // `is_deleted.is.null,is_deleted.eq.false`: apagada não entra em nenhum chip.
    or: () => consultaFalsa(linhas, [...predicados, (l) => (l.is_deleted ?? false) === false], limite),
    order: () => consultaFalsa(linhas, predicados, limite),
    limit: (quantidade: number) => consultaFalsa(linhas, predicados, quantidade),
    then: (onFulfilled: (valor: ReturnType<typeof resultado>) => unknown) =>
      Promise.resolve(resultado()).then(onFulfilled),
  };
}

let fixture: LinhaFalsa[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  tiposPedidos.length = 0;
  fixture = [];

  spies.from.mockImplementation((tabela: string) => (tabela === 'messages'
    ? {
      select: (colunas: string, opcoes?: unknown) => {
        spies.select(colunas, opcoes);
        return consultaFalsa(fixture);
      },
    }
    : { select: () => ({}) }));
  spies.storageFrom.mockImplementation((bucket: string) => ({
    createSignedUrls: (caminhos: string[], ttl: number) => spies.createSignedUrls(bucket, caminhos, ttl),
  }));
  spies.createSignedUrls.mockImplementation((bucket: string, caminhos: string[]) => Promise.resolve({
    data: caminhos.map((caminho) => ({
      path: caminho,
      signedUrl: `${STORAGE}/storage/v1/object/sign/${bucket}/${caminho}?token=teste`,
    })),
    error: null,
  }));
});

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

async function classificados() {
  const { result } = renderHook(() => useContactMedia('contato-1'), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return Object.fromEntries(result.current.items.map((item) => [item.id, item])) as Record<string, ContactMediaItem>;
}

async function contagens() {
  const { result } = renderHook(() => useContactMediaCounts('contato-1'), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result.current.counts;
}

const URL_MIDIA = (caminho: string) => `${STORAGE}/storage/v1/object/public/whatsapp-media/${caminho}`;

describe('M06 — classify: figurinha (message_type = sticker) nunca vira imagem', () => {
  const ROWS: LinhaFalsa[] = [
    // O webp animado do WhatsApp: chega com tipo/mime de imagem e ainda assim é figurinha.
    linha({
      id: 'fig-webp-animado',
      message_type: 'sticker',
      media_type: 'image',
      media_mimetype: 'image/webp',
      media_meta: { isAnimated: true },
      media_url: URL_MIDIA('stickers/animada.webp'),
    }),
    // Figurinha sem MIME nenhum e com o nome técnico do WhatsApp (hex + underscore).
    linha({
      id: 'fig-tecnica',
      message_type: 'sticker',
      media_mimetype: null,
      media_filename: '3EB0E6947FC0A0ECAED14D_1790283276022',
      media_url: URL_MIDIA('stickers/3EB0E6947FC0A0ECAED14D_1790283276022'),
    }),
    // Figurinha com nome humano: o nome é mantido.
    linha({
      id: 'fig-nome-humano',
      message_type: 'sticker',
      media_filename: 'bom-dia.webp',
      media_url: URL_MIDIA('stickers/bom-dia.webp'),
    }),
    // Contraprova: imagem webp de verdade continua imagem.
    linha({
      id: 'img-webp',
      message_type: 'image',
      media_mimetype: 'image/webp',
      media_filename: 'foto.webp',
      media_url: URL_MIDIA('images/foto.webp'),
    }),
    // Contraprova: .pdf com mimetype de imagem é documento (o tipo declarado manda no MIME enganoso).
    linha({
      id: 'doc-pdf-enganoso',
      message_type: 'document',
      media_type: 'document',
      media_mimetype: 'image/webp',
      media_filename: 'contrato.pdf',
      media_url: URL_MIDIA('documentos/contrato.pdf'),
    }),
  ];

  beforeEach(() => { fixture = ROWS; });

  it('webp animado com message_type sticker é figurinha — não é contado como imagem', async () => {
    const itens = await classificados();

    expect(itens['fig-webp-animado'].type).toBe('sticker');
    expect(itens['fig-webp-animado'].type).not.toBe('image');
    expect(itens['fig-webp-animado'].extension).toBe('webp');
  });

  it('nome técnico do WhatsApp não vira rótulo: a tela mostra "Figurinha · dd/MM HH:mm"', async () => {
    const item = (await classificados())['fig-tecnica'];

    // O nome técnico continua guardado (é ele que a dica mostra no cartão)…
    expect(item.filename).toBe('3EB0E6947FC0A0ECAED14D_1790283276022');
    // …mas nunca na cara do operador.
    expect(item.displayName).toMatch(/^Figurinha · \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(item.displayName).not.toContain('3EB0');

    const nome = cardName(item);
    expect(nome.text).toBe(item.displayName);
    expect(nome.isTechnical).toBe(true);
  });

  it('figurinha com nome humano preserva o nome (não é forçada ao rótulo do tipo)', async () => {
    const itens = await classificados();

    expect(itens['fig-nome-humano'].type).toBe('sticker');
    expect(itens['fig-nome-humano'].displayName).toBe('bom-dia.webp');
  });

  it('contraprovas: imagem webp continua imagem e o .pdf com MIME de imagem continua documento', async () => {
    const itens = await classificados();

    expect(itens['img-webp'].type).toBe('image');
    expect(itens['doc-pdf-enganoso'].type).toBe('document');
  });

  it('nenhuma figurinha do fixture chega ao filtro "Imagens"', async () => {
    const itens = await classificados();

    const figurinhas = Object.values(itens).filter((item) => item.type === 'sticker').map((item) => item.id);
    expect(figurinhas.sort()).toEqual(['fig-nome-humano', 'fig-tecnica', 'fig-webp-animado']);
    expect(Object.values(itens).filter((item) => item.type === 'image').map((item) => item.id)).toEqual(['img-webp']);
  });
});

describe('M06 — contadores dos chips: Todos, Imagens e Figurinhas', () => {
  const ROWS: LinhaFalsa[] = [
    linha({ id: 'img-1', message_type: 'image', media_mimetype: 'image/jpeg' }),
    linha({ id: 'img-2', message_type: 'image', media_mimetype: 'image/webp' }),
    // A figurinha do banco real: message_type sticker chegado como image/webp.
    linha({ id: 'fig-1', message_type: 'sticker', media_type: 'image', media_mimetype: 'image/webp' }),
    linha({ id: 'fig-2', message_type: 'sticker', media_mimetype: null }),
    linha({ id: 'fig-apagada', message_type: 'sticker', media_mimetype: null, is_deleted: true }),
    linha({ id: 'video-1', message_type: 'video' }),
    linha({ id: 'voz-1', message_type: 'ptt' }),
    linha({ id: 'audio-1', message_type: 'audio' }),
    linha({ id: 'doc-1', message_type: 'document' }),
    linha({ id: 'sem-url', message_type: 'image', media_url: null }),
  ];

  beforeEach(() => { fixture = ROWS; });

  /** Semântica dos chips, lida direto do FIXTURE: mídia com URL e não apagada, por message_type. */
  const vivas = () => ROWS.filter((l) => l.media_url !== null && (l.is_deleted ?? false) === false);
  const porTipo = (...tipos: string[]) => vivas().filter((l) => tipos.includes(l.message_type)).length;

  it('conta por message_type: a figurinha webp não entra em "Imagens" e é ela mesma em "Figurinhas"', async () => {
    // Coerência do fixture: a figurinha que se parece com imagem está lá.
    expect(ROWS.find((l) => l.id === 'fig-1')?.media_mimetype).toBe('image/webp');

    const counts = await contagens();

    expect(counts.image).toBe(porTipo('image'));
    expect(counts.sticker).toBe(porTipo('sticker'));
    expect(counts.video).toBe(porTipo('video'));
    expect(counts.audio).toBe(porTipo('ptt', 'audio'));
    expect(counts.document).toBe(porTipo('document'));
    // "Imagens" tem exatamente as 2 imagens: a figurinha webp não está lá.
    expect(counts.image).toBe(2);
  });

  it('Todos conta tudo (figurinha incluída) e cada mídia entra em um só chip', async () => {
    const counts = await contagens();

    expect(counts.all).toBe(vivas().length);
    // Soma dos chips fecha com o Todos: nada é contado duas vezes nem esquecido.
    expect(counts.image + counts.sticker + counts.video + counts.audio + counts.document).toBe(counts.all);
    expect(counts.sticker).toBe(2); // as duas vivas; a apagada não entra
  });

  it('a figurinha apagada e a linha sem URL ficam fora de todos os chips', async () => {
    const counts = await contagens();

    expect(ROWS.some((l) => l.id === 'fig-apagada' && l.is_deleted === true)).toBe(true);
    expect(ROWS.some((l) => l.id === 'sem-url' && l.media_url === null)).toBe(true);
    expect(counts.all).toBe(ROWS.length - 2);
  });

  it('cada chip consulta o SEU message_type: Imagens e Figurinhas são recortes disjuntos', async () => {
    await contagens();

    const pedidos = tiposPedidos
      .filter((pedido) => pedido.coluna === 'message_type')
      .map((pedido) => pedido.valores.join('+'))
      .sort();
    expect(pedidos).toEqual(['audio+ptt', 'document', 'image', 'sticker', 'video']);
    // "Todos" é a única consulta sem recorte de tipo — 6 consultas, uma por chip.
    expect(spies.from).toHaveBeenCalledTimes(6);

    const pedidoFigurinha = tiposPedidos.find((p) => p.valores.length === 1 && p.valores[0] === 'sticker');
    const pedidoImagem = tiposPedidos.find((p) => p.valores.length === 1 && p.valores[0] === 'image');
    expect(pedidoFigurinha?.valores).toEqual(['sticker']);
    expect(pedidoImagem?.valores).toEqual(['image']);
    expect(pedidoImagem?.valores.filter((tipo) => pedidoFigurinha?.valores.includes(tipo))).toEqual([]);
  });
});

describe('M06 — filtro "Figurinhas": ordenação e busca preservadas', () => {
  function midia(overrides: Partial<ContactMediaItem> & { id: string }): ContactMediaItem {
    return {
      url: URL_MIDIA(`arquivos/${overrides.id}`),
      type: 'image',
      filename: `${overrides.id}.jpg`,
      displayName: `${overrides.id}.jpg`,
      extension: 'jpg',
      senderLabel: null,
      created_at: '2026-01-10T10:00:00.000Z',
      caption: null,
      mimetype: 'image/jpeg',
      size: 2048,
      meta: null,
      sender: 'contact',
      ...overrides,
    };
  }

  const IMAGEM = midia({ id: 'img-praia', type: 'image', filename: 'foto-praia.jpg', displayName: 'foto-praia.jpg', created_at: '2026-01-10T10:00:00.000Z' });
  const FIGURINHA = midia({ id: 'fig-praia', type: 'sticker', filename: 'praia-fofa.webp', displayName: 'praia-fofa.webp', extension: 'webp', mimetype: 'image/webp', created_at: '2026-01-12T10:00:00.000Z' });
  const FIGURINHA_TECNICA = midia({ id: 'fig-tecnica', type: 'sticker', filename: '3EB0E6947FC0A0ECAED14D_1790283276022', displayName: 'Figurinha · 13/01 09:00', extension: null, mimetype: null, created_at: '2026-01-13T09:00:00.000Z' });
  const DOCUMENTO = midia({ id: 'doc-contrato', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf', extension: 'pdf', mimetype: 'application/pdf', caption: 'assinado', created_at: '2026-01-05T10:00:00.000Z' });
  const TODAS = [IMAGEM, FIGURINHA, FIGURINHA_TECNICA, DOCUMENTO];

  it('"Todos" continua com tudo, figurinha incluída', () => {
    expect(filterMediaItems(TODAS, 'all', '').map((item) => item.id))
      .toEqual(['img-praia', 'fig-praia', 'fig-tecnica', 'doc-contrato']);
  });

  it('"Figurinhas" e "Imagens" são recortes que não se cruzam', () => {
    expect(filterMediaItems(TODAS, 'sticker', '').map((item) => item.id)).toEqual(['fig-praia', 'fig-tecnica']);
    expect(filterMediaItems(TODAS, 'image', '').map((item) => item.id)).toEqual(['img-praia']);
  });

  it('a busca alcança a figurinha (nome próprio e nome técnico) sem perder o recorte do chip', () => {
    expect(filterMediaItems(TODAS, 'all', 'praia').map((item) => item.id)).toEqual(['img-praia', 'fig-praia']);
    expect(filterMediaItems(TODAS, 'sticker', 'PRAIA').map((item) => item.id)).toEqual(['fig-praia']);
    expect(filterMediaItems(TODAS, 'sticker', 'contrato')).toEqual([]);
    expect(filterMediaItems(TODAS, 'all', 'ASSINADO').map((item) => item.id)).toEqual(['doc-contrato']);
  });

  it('a ordenação por data continua valendo com a figurinha na lista (ela não vai para o fim)', () => {
    expect(sortMediaItems(TODAS, 'recent').map((item) => item.id))
      .toEqual(['fig-tecnica', 'fig-praia', 'img-praia', 'doc-contrato']);
    expect(sortMediaItems(TODAS, 'old').map((item) => item.id))
      .toEqual(['doc-contrato', 'img-praia', 'fig-praia', 'fig-tecnica']);
  });
});

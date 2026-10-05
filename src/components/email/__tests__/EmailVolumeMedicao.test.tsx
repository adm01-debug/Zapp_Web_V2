/* eslint-disable no-console -- medidor EN-088: imprime os números medidos como saída crua (padrão do PERF.md). */
/**
 * EN-088 (achado OTH-014) — medição de volume, memória, consultas, iframes,
 * listeners e blobs do módulo Email.
 *
 * A auditoria (docs/reconciliation/FINDINGS.json, OTH-014) registrou que o
 * módulo tem fixtures de 1.000 threads e extremos de anexos, mas NÃO tinha as
 * medições exigidas por EN-088 — consultas, memória, iframes, listeners e blobs
 * com orçamento antes/depois. Este arquivo é a medição: cada caso imprime uma
 * linha `EN088 | ...` e trava o orçamento medido. Os números alimentam
 * docs/design/EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md.
 *
 * O que NÃO é medido aqui (dito com todas as letras): heap JS do navegador.
 * jsdom não expõe `performance.memory`/`measureUserAgentSpecificMemory`, e medir
 * isso de verdade exige browser real (Playwright/DevTools), fora do escopo deste
 * cartão. No lugar de um número ruidoso, fica medido o custo que jsdom
 * representa fielmente: árvore DOM montada, material do corpus e ciclo de vida
 * de iframes, object URLs e listeners.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { collectEmailPages, chunkEmailIds } from '@/lib/emailPagination';
import { EmailThreadList } from '../EmailThreadList';
import { EmailFullViewDialog } from '../EmailFullViewDialog';
import { EmailAttachmentPreviewDialog } from '../EmailAttachmentPreviewDialog';
import type { EmailAttachment, EmailThread } from '@/hooks/integrations/useGmail';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => {
      if (prop === 'button' || prop === 'div') return ({ children, ...props }: Record<string, unknown>) => <button type="button" {...props}>{children as React.ReactNode}</button>;
      return ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>;
    },
  }),
}));

/** Corpus de volume do EN-088: N threads sintéticas. */
function corpus(total: number): EmailThread[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `bulk-${index}`, gmail_account_id: 'a1', gmail_thread_id: `g-${index}`, contact_id: null,
    subject: `Assunto ${index}`, snippet: 'Trecho de pré-visualização '.repeat(6),
    label_ids: [], message_count: 1, is_unread: false, is_starred: false,
    is_important: false, last_message_at: '2026-10-02T12:00:00Z',
    last_from_name: `Carga ${index}`, last_from_address: `carga${index}@exemplo.com`,
    assigned_to: null, status: 'open', priority: 'medium', tags: [],
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T12:00:00Z',
  } as EmailThread));
}

const baseProps = {
  threadsLoading: false, labels: [], unreadCount: 0, selectedThreadId: null,
  activeAccountEmail: 'conta@promobrindes.com.br',
  onSelectThread: () => {}, onNewEmail: () => {}, onSync: () => {}, isSyncing: false,
};

/** Linhas de thread realmente montadas no DOM (cada item expõe um `line-clamp-2`). */
function linhasMontadas(): number {
  return document.querySelectorAll('.line-clamp-2').length;
}

/** Contador de round-trips do carregamento de threads (páginas + lotes de anexo). */
async function medirConsultas(total: number) {
  let paginas = 0;
  const linha = (index: number) => ({ id: `bulk-${index}` });
  const todas = Array.from({ length: total }, (_, index) => linha(index));
  const carregadas = await collectEmailPages(async (from, to) => {
    paginas += 1;
    return todas.slice(from, to + 1);
  }, 1000, 50);
  const lotes = chunkEmailIds(carregadas.map(row => row.id), 500).length;
  // +2 = os dois `count: exact` (total e não lidos) que o hook dispara em paralelo.
  return { paginas, lotes, consultas: paginas + lotes + 2, carregadas: carregadas.length };
}

describe('EN-088 — medição de volume, memória, consultas, iframes, listeners e blobs', () => {
  beforeEach(() => window.history.replaceState({}, '', '/?view=email-chat'));
  afterEach(() => cleanup());

  it('consultas: o número de round-trips não cresce com o tamanho da caixa (sem N+1)', async () => {
    const pequeno = await medirConsultas(20);
    const grande = await medirConsultas(1000);
    console.log(
      `EN088 | consultas corpus=20  paginas=${pequeno.paginas} lotes=${pequeno.lotes} consultas=${pequeno.consultas} carregadas=${pequeno.carregadas}`,
    );
    console.log(
      `EN088 | consultas corpus=1000 paginas=${grande.paginas} lotes=${grande.lotes} consultas=${grande.consultas} carregadas=${grande.carregadas}`,
    );

    expect(grande.carregadas).toBe(1000);
    // Orçamento: páginas = ceil(N/1000) + 1 sondagem de fim; lotes = ceil(N/500);
    // consultas = páginas + lotes + 2 contadores exatos. Nada de 1 consulta por thread.
    expect(grande.paginas).toBeLessThanOrEqual(Math.ceil(1000 / 1000) + 1);
    expect(grande.lotes).toBe(Math.ceil(1000 / 500));
    expect(grande.consultas).toBe(grande.paginas + grande.lotes + 2);
    expect(grande.consultas).toBeLessThan(1000);
  });

  it('memória: 1.000 threads retêm só uma página de 20 linhas montadas', () => {
    const vinte = corpus(20);
    const mil = corpus(1000);
    const bytesCorpus = new TextEncoder().encode(JSON.stringify(mil)).length;
    console.log(`EN088 | memoria corpus=1000 material_bytes=${bytesCorpus}`);

    const pequeno = render(<EmailThreadList threads={vinte} {...baseProps} />);
    const nosPequeno = pequeno.container.querySelectorAll('*').length;
    const linhasPequeno = linhasMontadas();
    pequeno.unmount();

    const grande = render(<EmailThreadList threads={mil} {...baseProps} />);
    const nosGrande = grande.container.querySelectorAll('*').length;
    const linhasGrande = linhasMontadas();
    console.log(`EN088 | memoria dom corpus=20   linhas=${linhasPequeno} nos=${nosPequeno}`);
    console.log(`EN088 | memoria dom corpus=1000 linhas=${linhasGrande} nos=${nosGrande}`);

    expect(screen.getByText('Carga 0')).toBeInTheDocument();
    expect(screen.queryByText('Carga 20')).not.toBeInTheDocument();
    // Orçamento: a página local (20) não cresce com o corpus; a árvore do corpus
    // de 1.000 não pode ser maior que a de 20 além das linhas da própria página.
    expect(linhasGrande).toBe(20);
    expect(linhasGrande).toBe(linhasPequeno);
    expect(nosGrande).toBeLessThanOrEqual(nosPequeno + 20);
    // Orçamento do material retido: 1.000 threads cabem em < 1 MiB serializadas.
    expect(bytesCorpus).toBeLessThan(1024 * 1024);
  });

  it('iframes: no máximo 1 por leitura/prévia, e zero com o conteúdo fechado', () => {
    const view = render(<EmailFullViewDialog open={false} onOpenChange={vi.fn()} sanitizedHtml="<p>x</p>" />);
    const fechado = document.querySelectorAll('iframe').length;
    view.rerender(<EmailFullViewDialog open onOpenChange={vi.fn()} sanitizedHtml="<p>x</p>" />);
    const aberto = document.querySelectorAll('iframe').length;
    view.unmount();
    console.log(`EN088 | iframes leitura fechado=${fechado} aberto=${aberto} desmontado=${document.querySelectorAll('iframe').length}`);

    expect(fechado).toBe(0);
    expect(aberto).toBe(1);
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('blobs: 40 prévias em sequência mantêm ≤ 1 object URL vivo e zeram no fim', () => {
    let criados = 0;
    let revogados = 0;
    let vivos = 0;
    let pico = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => { criados += 1; vivos += 1; pico = Math.max(pico, vivos); return `blob:preview-${criados}`; }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => { revogados += 1; vivos -= 1; }),
    });

    const anexo = (index: number): EmailAttachment => ({
      id: `att-${index}`, email_message_id: 'message-1', gmail_attachment_id: `gmail-${index}`,
      filename: `anexo-${index}.pdf`, mime_type: 'application/pdf', size_bytes: 3,
    });

    const view = render(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo(0)} contentBase64="AQID" />);
    for (let index = 1; index < 40; index += 1) {
      view.rerender(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo(index)} contentBase64="AQIDBAUGBwg=" />);
    }
    const vivosComDialogo = vivos;
    view.unmount();
    console.log(`EN088 | blobs criados=${criados} revogados=${revogados} pico_vivos=${pico} antes_de_fechar=${vivosComDialogo} depois_de_fechar=${vivos}`);

    expect(criados).toBe(40);
    // Orçamento: o pico é ≤ 2 (o object URL da prévia nova nasce antes de o da
    // antiga ser revogado), nunca 40; em repouso com o diálogo aberto há 1 vivo.
    expect(pico).toBeLessThanOrEqual(2);
    expect(vivosComDialogo).toBe(1);
    expect(vivos).toBe(0);
  });

  it('listeners: abrir/fechar 40 prévias não deixa listener pendente acumulado', () => {
    // Rastreia por IDENTIDADE (listener → tipo) para não contar remoções de
    // listeners registrados fora da janela medida. O que importa é o saldo de
    // listeners que ESTE ciclo registrou: se um vazar, o mapa cresce por ciclo.
    const vivosGlobal = new Map<unknown, string>();
    const instrumentar = (alvo: Window | Document) => {
      const add = alvo.addEventListener.bind(alvo) as (type: string, listener: unknown, options?: unknown) => void;
      const remove = alvo.removeEventListener.bind(alvo) as (type: string, listener: unknown, options?: unknown) => void;
      alvo.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
        vivosGlobal.set(listener, type);
        add(type, listener, options);
      }) as unknown as typeof alvo.addEventListener;
      alvo.removeEventListener = ((type: string, listener: unknown, options?: unknown) => {
        vivosGlobal.delete(listener);
        remove(type, listener, options);
      }) as unknown as typeof alvo.removeEventListener;
      return { add, remove };
    };
    const originaisJanela = { add: window.addEventListener.bind(window) as typeof window.addEventListener, remove: window.removeEventListener.bind(window) as typeof window.removeEventListener };
    const originaisDoc = { add: document.addEventListener.bind(document) as typeof document.addEventListener, remove: document.removeEventListener.bind(document) as typeof document.removeEventListener };
    instrumentar(window);
    instrumentar(document);

    const anexo: EmailAttachment = {
      id: 'att-1', email_message_id: 'message-1', gmail_attachment_id: 'gmail-1',
      filename: 'anexo.pdf', mime_type: 'application/pdf', size_bytes: 3,
    };
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    let pendentesAposPrimeiro = 0;
    for (let ciclo = 0; ciclo < 40; ciclo += 1) {
      const view = render(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={anexo} contentBase64="AQID" />);
      view.unmount();
      if (ciclo === 0) pendentesAposPrimeiro = vivosGlobal.size;
    }
    const pendentesAposUltimo = vivosGlobal.size;
    console.log(`EN088 | listeners pendentes_apos_1_ciclo=${pendentesAposPrimeiro} pendentes_apos_40_ciclos=${pendentesAposUltimo}`);

    window.addEventListener = originaisJanela.add;
    window.removeEventListener = originaisJanela.remove;
    document.addEventListener = originaisDoc.add;
    document.removeEventListener = originaisDoc.remove;

    // Orçamento: o saldo de listeners não cresce com o número de ciclos.
    expect(pendentesAposUltimo).toBe(pendentesAposPrimeiro);
  });
});

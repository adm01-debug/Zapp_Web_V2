/**
 * TL-038 (F70) — fundação visual do módulo Multiplix.
 *
 * Dois defeitos medidos no código de ponta:
 *  1. o protótipo DarkBlue usa tokens `--zapp-*` que vivem só em
 *     `docs/design/ZAPP_DARKBLUE_PREMIUM_TOKENS.css` — que o app NÃO carrega.
 *     No runtime `border-[--zapp-border]` e `bg-[--zapp-surface-1]`
 *     (`MultiplixView.tsx`) não resolvem para nada: a borda cai em `currentColor`
 *     e o fundo fica transparente (auditoria de 29/09, achado 28 / etapa E119);
 *  2. px fora da escala (`text-[13px]`, `min-w-[130px]`, `max-h-[360px]`,
 *     `max-h-[480px]`) — `text-[Npx]` não declara `line-height` e é o que o guard
 *     de tipografia (`scripts/qa/medir-tipografia.cjs`) reprova.
 *
 * A prova é feita nos componentes REAIS (`MultiplixView` e `MultiplixMonitor`,
 * com os hooks de dados mockados) e no motor de CSS do jsdom: `src/styles/tokens.css`
 * entra no documento como folha de estilo de verdade — mesma técnica de
 * `src/styles/__tests__/densityTextSizeCascade.test.ts`. Quem diz se um token existe
 * é o CSS, não uma regex sobre o `.tsx`.
 *
 * Fica VERMELHO contra o código sem a correção (o painel de filtros aplicava os dois
 * tokens do protótipo, que não estão em tokens.css, e os px arbitrários voltam) e
 * verde com ela.
 *
 * Escopo: só o que o cartão toca. O subtítulo do `ModuleHeader` (de
 * `src/components/talkx/kit/primitives.tsx`, componente compartilhado de outro módulo)
 * ainda usa `text-[13px]`; por isso as regras são conferidas nas subárvores dos blocos
 * DESTA tela — que ficam fora do cabeçalho — e nunca no DOM inteiro.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';

/* ------------------------------------------------------------------ *
 * Tokens: a fonte é o arquivo que o app carrega (src/styles/tokens.css)
 * ------------------------------------------------------------------ */

const TOKENS_CSS = readFileSync('src/styles/tokens.css', 'utf8');
/** Nomes declarados em `--nome: ...` (o mesmo arquivo entra como folha no jsdom). */
const TOKENS_DECLARADOS = new Set(
  [...TOKENS_CSS.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

const TAILWIND = readFileSync('tailwind.config.ts', 'utf8');

/** Degraus de texto declarados em `fontSize` no tailwind.config.ts (a escala sancionada). */
const ESCALA_TEXTO = new Set(
  (() => {
    const ini = TAILWIND.indexOf('fontSize: {');
    const fim = TAILWIND.indexOf('\n      },', ini);
    return [...TAILWIND.slice(ini, fim).matchAll(/"?([a-z0-9-]+)"?:\s*\[\s*"/g)].map((m) => m[1]);
  })(),
);

/** Injeta o CSS de tokens no documento — quem resolve passa a ser o motor de CSS. */
function injetarTokens(): void {
  const folha = document.createElement('style');
  folha.textContent = TOKENS_CSS;
  document.head.appendChild(folha);
}

/** Valor concreto que o token tem na cascata (vazio = token inexistente). */
function valorDoToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/* ------------------------------------------------------------------ *
 * Regras conferidas no DOM renderizado
 * ------------------------------------------------------------------ */

function classesDe(el: Element): string[] {
  return (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean);
}

/** Variáveis CSS referenciadas pela classe que NÃO existem em tokens.css. */
function tokensInexistentes(classe: string): string[] {
  const nomes = [
    ...[...classe.matchAll(/\[--([a-z0-9-]+)\]/g)].map((m) => m[1]), // bg-[--x]  (arbitrário cru)
    ...[...classe.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]), // bg-[hsl(var(--x))]
  ];
  return [...new Set(nomes)].filter((n) => !TOKENS_DECLARADOS.has(n));
}

/** Classes com px arbitrário (`text-[13px]`, `min-w-[130px]`, `max-h-[480px]`). */
function pxArbitrarioDe(el: Element): string[] {
  return classesDe(el).filter((c) => /\[[0-9.]+px\]/.test(c));
}

/** px arbitrário no bloco inteiro (o elemento e todos os descendentes). */
function pxArbitrarioNoBloco(el: Element): string[] {
  return [el, ...el.querySelectorAll('*')].flatMap(pxArbitrarioDe);
}

/** Tokens inexistentes em qualquer classe do DOM renderizado. */
function tokensInexistentesNoDom(container: HTMLElement): string[] {
  return [...container.querySelectorAll('*')].flatMap((el) => classesDe(el).flatMap(tokensInexistentes));
}

/**
 * Token do tema que uma utility de cor nomeada usa (`bg-card` -> `--card`).
 * Devolve null quando a classe não é cor nomeada — é o caso do defeito
 * (`bg-[--zapp-surface-1]`, `border-[--zapp-border]`), que não passa pela escala.
 */
function tokenDaCorNomeada(classe: string): string | null {
  const m = /^(?:bg|border|border-t|border-b|divide|ring|fill|stroke)-([a-z][a-z-]*)(?:\/\d+)?$/.exec(classe);
  return m ? `--${m[1]}` : null;
}

/* ------------------------------------------------------------------ *
 * Dados de exemplo (sintéticos)
 * ------------------------------------------------------------------ */

const h = vi.hoisted(() => ({
  dispatches: [] as unknown[],
  rows: [] as unknown[],
  count: undefined as number | undefined,
  recipients: { rows: [] as unknown[], total: null as number | null, truncated: false },
  recipientsError: null as unknown,
}));

function disparo(i: number) {
  return {
    id: `d${i}`,
    name: `Disparo ${i}`,
    message_template: 'oi',
    status: 'completed',
    total_recipients: 10,
    sent_count: 10,
    failed_count: 0,
    delivered_count: 0,
    outcome_unknown_count: 0,
    started_at: null,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: `2026-10-0${i}T10:00:00Z`,
  };
}

function empresa(i: number) {
  return {
    company_id: `c${i}`,
    company_name: `Empresa ${i}`,
    ramo_atividade: 'Comércio',
    uf: 'SP',
    destino_e164: '+5511999999999',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'Público selecionado',
  };
}

function destinatario(i: number) {
  return {
    id: `r${i}`,
    company_name_snapshot: `Empresa ${i}`,
    destino_e164: '+5511999999999',
    status: 'sent',
    sent_at: null,
    error_message: null,
    personalized_message: null,
  };
}

/* ------------------------------------------------------------------ *
 * Mocks dos hooks de dados (as telas REAIS continuam sendo as do app)
 * ------------------------------------------------------------------ */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

// F74 (TL-007): o virtualizer real depende de medições de layout que o jsdom não
// fornece (igual ao MultiplixView.lista-virtualizada.test.tsx) — sem o mock, a janela
// visível fica vazia e nenhuma linha aparece no DOM.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: (i: number) => number }) => {
    const size = options.estimateSize(0);
    const visible = Math.min(options.count, 25);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: visible }, (_, index) => ({
          index, size, start: index * size, end: (index + 1) * size, key: index, lane: 0,
        })),
      measure: () => {},
      measureElement: () => {},
    };
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({
    mutate: (vars: { page: number }, opts?: { onSuccess?: (d: unknown[]) => void }) => {
      if (vars.page === 0) opts?.onSuccess?.(h.rows);
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useMultiplixCount: () => ({ mutate: () => {}, isPending: false, data: h.count }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: h.dispatches, refetch: vi.fn() }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMultiplixDispatch: () => ({
    data: {
      id: 'd1',
      name: 'Disparo 1',
      message_template: 'oi',
      status: 'sending',
      total_recipients: 2,
      sent_count: 1,
      failed_count: 0,
      delivered_count: 0,
      outcome_unknown_count: 0,
      started_at: null,
      paused_at: null,
      pause_reason: null,
      completed_at: null,
      created_at: '2026-10-01T10:00:00Z',
    },
  }),
  useMultiplixRecipients: () => ({
    data: h.recipients,
    isError: h.recipientsError !== null,
    error: h.recipientsError,
  }),
  useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
  MultiplixDispatchEdgeError: class MultiplixDispatchEdgeError extends Error {},
}));

import MultiplixView from '@/components/multiplix/MultiplixView';
import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

function comQueryClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeAll(() => {
  injetarTokens();
});

beforeEach(() => {
  // 50 empresas = página cheia (PAGE_SIZE) e count maior = "Carregar mais" visível.
  h.dispatches = Array.from({ length: 3 }, (_, i) => disparo(i + 1));
  h.rows = Array.from({ length: 50 }, (_, i) => empresa(i + 1));
  h.count = 60;
  h.recipients = { rows: [destinatario(1)], total: 1, truncated: false };
  h.recipientsError = null;
});

/* ------------------------------------------------------------------ *
 * As regras
 * ------------------------------------------------------------------ */

describe('TL-038 (F70) — fundação visual: tokens reais e zero px arbitrário', () => {
  it('os tokens que a tela usa existem na folha que o app carrega (claro e escuro)', () => {
    // `--card` e `--border` são o alvo da troca: `--zapp-surface-1`/`--zapp-border`
    // vinham do protótipo (docs/design) e NÃO estão em tokens.css.
    expect(valorDoToken('--card')).not.toBe('');
    expect(valorDoToken('--border')).not.toBe('');

    document.documentElement.classList.add('dark');
    expect(valorDoToken('--card')).not.toBe('');
    expect(valorDoToken('--border')).not.toBe('');
    document.documentElement.classList.remove('dark');

    // O protótipo continua fora do runtime — é isso que denunciava o defeito.
    expect(valorDoToken('--zapp-surface-1')).toBe('');
    expect(valorDoToken('--zapp-border')).toBe('');
  });

  it('MultiplixView: o painel de filtros usa os tokens reais, não os do protótipo', () => {
    const { container } = comQueryClient(<MultiplixView />);

    // O painel existe sempre (não depende de dado) e é ancorado pelo rótulo "Público".
    const painel = screen.getByLabelText('Público').closest('div.rounded-2xl');
    expect(painel).not.toBeNull();
    // Nada de cor arbitrária (`bg-[--x]`) e toda cor nomeada resolvendo na folha:
    // antes da correção o painel não tinha nenhuma cor nomeada — só os --zapp-*.
    expect(classesDe(painel!).filter((c) => /^(bg|border)-\[/.test(c))).toEqual([]);
    const coresDoPainel = classesDe(painel!).map(tokenDaCorNomeada).filter((t): t is string => t !== null);
    expect(coresDoPainel.length).toBeGreaterThan(0);
    expect(coresDoPainel.filter((t) => valorDoToken(t) === '')).toEqual([]);

    // Todo o bloco (rótulos, selects, botão Buscar), o painel "Disparos recentes"
    // e a contagem do filtro — sem px arbitrário.
    const recentes = screen.getByText('Disparos recentes').closest('div.rounded-2xl')!;
    const contagem = screen.getByText(/empresa\(s\) no filtro atual/);
    expect(pxArbitrarioNoBloco(painel!)).toEqual([]);
    expect(pxArbitrarioNoBloco(recentes)).toEqual([]);
    expect(pxArbitrarioNoBloco(contagem)).toEqual([]);

    // E nenhuma classe do DOM da tela aponta para variável que não existe.
    expect(tokensInexistentesNoDom(container)).toEqual([]);
  });

  it('MultiplixView: tabela, "Carregar mais" e barra de seleção também estão limpos', () => {
    const { container } = comQueryClient(<MultiplixView />);

    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(screen.getByText('Empresa 1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Selecionar Empresa 1'));

    // Os blocos que só nascem depois da busca/seleção renderizaram:
    const molduraTabela = screen.getByRole('table').closest('div.rounded-2xl')!;
    const blocoCarregarMais = screen.getByRole('button', { name: /Carregar mais/ }).parentElement!;
    const barraSelecao = screen.getByText(/empresa\(s\) selecionada\(s\)/).closest('div')!;

    for (const bloco of [molduraTabela, blocoCarregarMais, barraSelecao]) {
      expect(pxArbitrarioNoBloco(bloco), `${bloco.tagName}|${bloco.className}`).toEqual([]);
    }

    expect(tokensInexistentesNoDom(container)).toEqual([]);
  });

  it('MultiplixMonitor: filtro, lista e nome do destinatário sem px arbitrário', () => {
    const { container } = comQueryClient(<MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />);

    const nome = screen.getByText('Empresa 1');
    // `text-[13px]` -> degrau nomeado da escala (`text-sm`, absorção sancionada em
    // docs/tipografia/PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md:85).
    const tamanhosDoNome = classesDe(nome)
      .map((c) => /^text-(.+)$/.exec(c)?.[1] ?? '')
      .filter((t) => ESCALA_TEXTO.has(t));
    expect(tamanhosDoNome.length).toBeGreaterThan(0);

    // A tela inteira do monitor: cabeçalho do disparo, KPIs, filtro de status e lista.
    const tela = nome.closest('div.space-y-4')!;
    expect(pxArbitrarioNoBloco(tela)).toEqual([]);
    expect(pxArbitrarioDe(screen.getByRole('combobox'))).toEqual([]);

    expect(tokensInexistentesNoDom(container)).toEqual([]);
  });

  it('MultiplixMonitor: estados de amostra/falha e de lista vazia também ficam limpos', () => {
    // Amostra do total + falha de leitura (os dois avisos da tela).
    h.recipients = { rows: Array.from({ length: 3 }, (_, i) => destinatario(i + 1)), total: 1500, truncated: true };
    h.recipientsError = new Error('Edge Function returned a non-2xx status code');
    const amostra = comQueryClient(<MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />);

    expect(screen.getByText(/amostra/i)).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível carregar os destinatários/)).toBeInTheDocument();
    expect(pxArbitrarioNoBloco(amostra.container)).toEqual([]);
    expect(tokensInexistentesNoDom(amostra.container)).toEqual([]);
    amostra.unmount();

    // Lista vazia confirmada (leitura OK, sem destinatário).
    h.recipients = { rows: [], total: 0, truncated: false };
    h.recipientsError = null;
    const vazio = comQueryClient(<MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />);

    expect(screen.getByText('Nenhum destinatário encontrado')).toBeInTheDocument();
    expect(pxArbitrarioNoBloco(vazio.container)).toEqual([]);
    expect(tokensInexistentesNoDom(vazio.container)).toEqual([]);
  });
});

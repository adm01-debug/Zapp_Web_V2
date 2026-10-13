/**
 * Testes de `src/pages/admin/RateLimitDashboard.tsx` — aba Logs.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco): o duplo reproduce só o
 * encadeamento do PostgREST (`from().select().ilike().eq().order().range().limit()`)
 * e devolve, por fila, a resposta de cada consulta. A TELA REAL e o HOOK REAL de
 * `useRateLimitLogs` são exercitados — nada de mock de hook com resposta pronta.
 * As duas consultas ficam em filas separadas (a que tem `.range()` é a listagem).
 *
 * Casos: controles com nome acessível (teclado por elemento nativo), filtro/ordem
 * resolvidos no servidor, paginação no servidor com os extremos desabilitados,
 * contagem REAL no cabeçalho (não o tamanho da página), e os estados de
 * carregando, erro (com ação de tentar de novo) e vazio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';

type Resposta = { data?: unknown; count?: number | null; error?: unknown };
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};
type Consulta = {
  tabela: string;
  colunas: string | null;
  contagem: string | null;
  ilike: [string, string][];
  eq: [string, unknown][];
  ordem: [string, boolean | undefined][];
  range: [number, number] | null;
  limite: number | null;
  signal?: AbortSignal;
};

const mocks = vi.hoisted(() => ({
  pagina: [] as unknown[],
  stats: [] as unknown[],
  consultas: [] as Consulta[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const registro: Consulta = {
        tabela,
        colunas: null,
        contagem: null,
        ilike: [],
        eq: [],
        ordem: [],
        range: null,
        limite: null,
      };
      mocks.consultas.push(registro);
      const builder: Record<string, unknown> = {
        select: (colunas: string, opcoes?: { count?: string }) => {
          registro.colunas = colunas;
          registro.contagem = opcoes?.count ?? null;
          return builder;
        },
        ilike: (coluna: string, valor: string) => {
          registro.ilike.push([coluna, valor]);
          return builder;
        },
        eq: (coluna: string, valor: unknown) => {
          registro.eq.push([coluna, valor]);
          return builder;
        },
        order: (coluna: string, opcoes?: { ascending?: boolean }) => {
          registro.ordem.push([coluna, opcoes?.ascending]);
          return builder;
        },
        range: (from: number, to: number) => {
          registro.range = [from, to];
          return builder;
        },
        limit: (n: number) => {
          registro.limite = n;
          return builder;
        },
        abortSignal: (signal: AbortSignal) => {
          registro.signal = signal;
          return builder;
        },
        then: (onFulfilled: (v: Resposta) => unknown, onRejected: (e: unknown) => unknown) => {
          const fila = registro.range ? mocks.pagina : mocks.stats;
          const padrao: Resposta = registro.range ? { data: [], count: 0 } : { data: [] };
          const entrada = fila.shift() ?? padrao;
          const resultado =
            entrada && typeof entrada === 'object' && 'deferred' in (entrada as object)
              ? (entrada as { deferred: Deferred<Resposta> }).deferred.promise
              : Promise.resolve(entrada as Resposta);
          return resultado.then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false }),
}));

// Painéis das outras abas: fora do escopo do cartão e com consulta própria.
vi.mock('@/components/security/BlockedIPsPanel', () => ({ BlockedIPsPanel: () => null }));
vi.mock('@/components/security/IPWhitelistPanel', () => ({ IPWhitelistPanel: () => null }));

import RateLimitDashboard from '@/pages/admin/RateLimitDashboard';
import type { RateLimitLog } from '@/hooks/system/useRateLimitLogs';

function log(id: string, overrides: Partial<RateLimitLog> = {}): RateLimitLog {
  return {
    id,
    ip_address: '10.0.0.1',
    endpoint: '/api/v1/messages',
    user_id: null,
    request_count: 1,
    blocked: false,
    user_agent: null,
    country: null,
    city: null,
    created_at: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

/** Última consulta de listagem (a que leva `.range()`). */
function ultimaPagina(): Consulta {
  const paginas = mocks.consultas.filter(c => c.range !== null);
  return paginas[paginas.length - 1];
}

/** Abre a aba Logs (as `TabsContent` do Radix só montam a aba ativa). */
async function abrirAbaLogs() {
  const aba = screen.getByRole('tab', { name: /logs/i });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
  await waitFor(() => expect(screen.getByLabelText(/filtrar por ip/i)).toBeInTheDocument());
}

beforeEach(() => {
  mocks.pagina.length = 0;
  mocks.stats.length = 0;
  mocks.consultas.length = 0;
});

describe('RateLimitDashboard — aba Logs', () => {
  it('oferece filtro, ordenação e paginação com nome acessível', async () => {
    mocks.pagina.push({ data: [log('a')], count: 1 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    expect(screen.getByLabelText(/filtrar por ip/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filtrar por endpoint/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /só bloqueados/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /ordenar por/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inverter ordem de classificação/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /página anterior/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /próxima página/i })).toBeInTheDocument();
  });

  it('mostra a contagem REAL do servidor no cabeçalho, não o tamanho da página', async () => {
    mocks.pagina.push({ data: [log('a')], count: 42 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    expect(await screen.findByText(/de 42 requisições/i)).toBeInTheDocument();
    expect(screen.queryByText(/últimas 100/i)).not.toBeInTheDocument();
  });

  it('filtra no servidor ao digitar o IP e marcar "só bloqueados"', async () => {
    mocks.pagina.push({ data: [], count: 0 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    fireEvent.change(screen.getByLabelText(/filtrar por ip/i), { target: { value: '10.0.0.1' } });
    await waitFor(() => expect(ultimaPagina().ilike).toHaveLength(1));

    fireEvent.click(screen.getByRole('checkbox', { name: /só bloqueados/i }));
    await waitFor(() => expect(ultimaPagina().eq).toEqual([['blocked', true]]));

    const pagina = ultimaPagina();
    expect(pagina.tabela).toBe('rate_limit_logs');
    expect(pagina.contagem).toBe('exact');
    expect(pagina.ilike).toEqual([['ip_address', '%10.0.0.1%']]);
    // Volta para a página 1 ao trocar o filtro e continua pedindo 25 por página.
    expect(pagina.range).toEqual([0, 24]);
  });

  it('pagina no servidor e desabilita os botões nos extremos', async () => {
    mocks.pagina.push({ data: [log('a')], count: 42 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    const anterior = screen.getByRole('button', { name: /página anterior/i });
    const proxima = screen.getByRole('button', { name: /próxima página/i });
    expect(anterior).toBeDisabled();
    expect(await screen.findByText(/página 1 de 2/i)).toBeInTheDocument();

    mocks.pagina.push({ data: [log('b')], count: 42 });
    fireEvent.click(proxima);

    await waitFor(() => expect(ultimaPagina().range).toEqual([25, 49]));
    expect(await screen.findByText(/página 2 de 2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /próxima página/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /página anterior/i })).toBeEnabled();

    mocks.pagina.push({ data: [log('a')], count: 42 });
    fireEvent.click(screen.getByRole('button', { name: /página anterior/i }));
    await waitFor(() => expect(ultimaPagina().range).toEqual([0, 24]));
  });

  it('inverte a ordem no servidor', async () => {
    mocks.pagina.push({ data: [log('a')], count: 1 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    expect(ultimaPagina().ordem[0]).toEqual(['created_at', false]);

    fireEvent.click(screen.getByRole('button', { name: /inverter ordem de classificação/i }));
    await waitFor(() => expect(ultimaPagina().ordem[0]).toEqual(['created_at', true]));
    expect(ultimaPagina().ordem[1]).toEqual(['id', true]);
  });

  it('mostra o estado de carregando antes da primeira resposta', async () => {
    let liberar!: (v: Resposta) => void;
    const pendente = new Promise<Resposta>(res => { liberar = res; });
    mocks.pagina.push({ deferred: { promise: pendente, resolve: liberar, reject: () => {} } });

    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    expect(screen.getByText(/carregando logs/i)).toBeInTheDocument();

    liberar({ data: [log('a')], count: 1 });
    expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.queryByText(/carregando logs/i)).not.toBeInTheDocument();
  });

  it('mostra o vazio quando o filtro não devolve log', async () => {
    mocks.pagina.push({ data: [], count: 0 });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    expect(await screen.findByText(/nenhum log encontrado/i)).toBeInTheDocument();
    expect(screen.getByText(/nenhuma requisição encontrada/i)).toBeInTheDocument();
  });

  it('mostra o erro da consulta com ação de tentar de novo', async () => {
    mocks.pagina.push({ data: null, count: null, error: { message: 'permission denied' } });
    render(<RateLimitDashboard />);
    await abrirAbaLogs();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('permission denied');

    const antes = mocks.consultas.filter(c => c.range !== null).length;
    mocks.pagina.push({ data: [log('a')], count: 1 });
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    await waitFor(() =>
      expect(mocks.consultas.filter(c => c.range !== null).length).toBeGreaterThan(antes),
    );
    expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();
  });

  it('usa a janela de estatística (não a página) no percentual e nos alertas', async () => {
    // Página com 1 linha não bloqueada; janela de estatística com 4 linhas e 2 bloqueadas.
    mocks.pagina.push({ data: [log('a')], count: 90 });
    mocks.stats.push({
      data: [log('a', { request_count: 1 }), log('b', { request_count: 4, blocked: true })],
    });

    render(<RateLimitDashboard />);

    // sampleSize=2 e blockedRequests=1 => 50%; se o denominador fosse a página
    // (1 linha, 0 bloqueadas) o cartão mostraria 0% ou leria `logs.length`.
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: /requisições bloqueadas/i })).toHaveAttribute(
        'aria-valuenow',
        '50',
      ),
    );
    expect(screen.getByText(/50% do total/i)).toBeInTheDocument();
  });

  it('não deixa controle sem nome acessível na aba Logs', async () => {
    mocks.pagina.push({ data: [log('a')], count: 1 });
    const { container } = render(<RateLimitDashboard />);
    await abrirAbaLogs();

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    const semNome = results.violations.filter(v =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});

afterEach(() => cleanup());

/** Testes da aba Logs de `RateLimitDashboard`: tela + hook reais, rede dublada.
 * Casos: controles nomeados, filtro/ordem/paginação e contagem no servidor,
 * carregando, vazio, erro com retry, tempo esgotado, banner sem esconder linhas. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

type Resposta = { data?: unknown; count?: number | null; error?: unknown };
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
type Consulta = {
  tabela: string; colunas: string | null; contagem: string | null;
  ilike: [string, string][]; eq: [string, unknown][]; ordem: [string, boolean | undefined][];
  range: [number, number] | null; limite: number | null; signal?: AbortSignal;
};

const mocks = vi.hoisted(() => ({
  pagina: [] as unknown[],
  stats: [] as unknown[],
  consultas: [] as Consulta[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const registro: Consulta = { tabela, colunas: null, contagem: null, ilike: [], eq: [], ordem: [], range: null, limite: null };
      mocks.consultas.push(registro);
      const builder: Record<string, unknown> = {
        select: (c: string, o?: { count?: string }) => { registro.colunas = c; registro.contagem = o?.count ?? null; return builder; },
        ilike: (c: string, v: string) => { registro.ilike.push([c, v]); return builder; },
        eq: (c: string, v: unknown) => { registro.eq.push([c, v]); return builder; },
        order: (c: string, o?: { ascending?: boolean }) => { registro.ordem.push([c, o?.ascending]); return builder; },
        range: (a: number, b: number) => { registro.range = [a, b]; return builder; },
        limit: (n: number) => { registro.limite = n; return builder; },
        abortSignal: (s: AbortSignal) => { registro.signal = s; return builder; },
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

vi.mock('@/components/security/BlockedIPsPanel', () => ({ BlockedIPsPanel: () => null }));
vi.mock('@/components/security/IPWhitelistPanel', () => ({ IPWhitelistPanel: () => null }));

import RateLimitDashboard from '@/pages/admin/RateLimitDashboard';
import type { RateLimitLog } from '@/hooks/system/useRateLimitLogs';

function log(id: string, overrides: Partial<RateLimitLog> = {}): RateLimitLog {
  return {
    id, ip_address: '10.0.0.1', endpoint: '/api/v1/messages', user_id: null,
    request_count: 1, blocked: false, user_agent: null, country: null, city: null,
    created_at: '2026-10-13T10:00:00.000Z', ...overrides,
  };
}

function ultimaPagina(): Consulta {
  const paginas = mocks.consultas.filter(c => c.range !== null);
  return paginas[paginas.length - 1];
}

/** A `TabsContent` do Radix só monta a aba ativa: o clique abre a Logs. */
async function abrirAbaLogs() {
  const aba = screen.getByRole('tab', { name: /logs/i });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
  await waitFor(() => expect(screen.getByLabelText(/filtrar por ip/i)).toBeInTheDocument());
}

/** A tela monta sob o roteador, como na rota real — sem isso o clique na aba
 * pode nem montar o conteúdo e o teste passaria por motivo errado. */
function renderizar() {
  return render(
    <MemoryRouter>
      <RateLimitDashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.pagina.length = 0;
  mocks.stats.length = 0;
  mocks.consultas.length = 0;
});

describe('RateLimitDashboard — aba Logs', () => {
  it('oferece filtro, ordenação e paginação com nome acessível', async () => {
    mocks.pagina.push({ data: [log('a')], count: 1 });
    renderizar();
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
    renderizar();
    await abrirAbaLogs();

    expect(await screen.findByText(/de 42 requisições/i)).toBeInTheDocument();
    expect(screen.queryByText(/últimas 100/i)).not.toBeInTheDocument();
  });

  it('filtra no servidor ao digitar o IP e marcar "só bloqueados"', async () => {
    mocks.pagina.push({ data: [], count: 0 });
    renderizar();
    await abrirAbaLogs();

    fireEvent.change(screen.getByLabelText(/filtrar por ip/i), { target: { value: '10.0.0.1' } });
    await waitFor(() => expect(ultimaPagina().ilike).toHaveLength(1));

    fireEvent.click(screen.getByRole('checkbox', { name: /só bloqueados/i }));
    await waitFor(() => expect(ultimaPagina().eq).toEqual([['blocked', true]]));

    const pagina = ultimaPagina();
    expect(pagina.tabela).toBe('rate_limit_logs');
    expect(pagina.contagem).toBe('exact');
    expect(pagina.ilike).toEqual([['ip_address', '%10.0.0.1%']]);
    expect(pagina.range).toEqual([0, 24]);
  });

  it('pagina no servidor e desabilita os botões nos extremos', async () => {
    mocks.pagina.push({ data: [log('a')], count: 42 });
    renderizar();
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
    renderizar();
    await abrirAbaLogs();

    expect(ultimaPagina().ordem[0]).toEqual(['created_at', false]);

    fireEvent.click(screen.getByRole('button', { name: /inverter ordem de classificação/i }));
    await waitFor(() => expect(ultimaPagina().ordem[0]).toEqual(['created_at', true]));
    expect(ultimaPagina().ordem[1]).toEqual(['id', true]);
  });

  it('mostra o estado de carregando antes da primeira resposta', async () => {
    let liberar!: (v: Resposta) => void;
    mocks.pagina.push({ deferred: { promise: new Promise<Resposta>(res => { liberar = res; }), resolve: (v: Resposta) => liberar(v), reject: () => {} } });

    renderizar();
    await abrirAbaLogs();

    expect(screen.getByText(/carregando logs/i)).toBeInTheDocument();

    liberar({ data: [log('a')], count: 1 });
    expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.queryByText(/carregando logs/i)).not.toBeInTheDocument();
  });

  it('mostra o vazio quando o filtro não devolve log', async () => {
    mocks.pagina.push({ data: [], count: 0 });
    renderizar();
    await abrirAbaLogs();

    expect(await screen.findByText(/nenhum log encontrado/i)).toBeInTheDocument();
    expect(screen.getByText(/nenhuma requisição encontrada/i)).toBeInTheDocument();
  });

  it('mostra o erro da consulta com ação de tentar de novo', async () => {
    mocks.pagina.push({ data: null, count: null, error: { message: 'permission denied' } });
    renderizar();
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

  it('tempo esgotado na primeira carga: banner em vez de tabela vazia', async () => {
    const ctl = new AbortController();
    const espionagem = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal);
    try {
      let liberar!: (v: Resposta) => void;
      mocks.pagina.push({ deferred: { promise: new Promise<Resposta>(res => { liberar = res; }), resolve: (v: Resposta) => liberar(v), reject: () => {} } });
      renderizar();
      await abrirAbaLogs();

      ctl.abort();
      liberar({ data: [log('a')], count: 1 });

      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent(/tempo esgotado/i);
    } finally {
      espionagem.mockRestore();
    }
  });

  it('erro depois do sucesso: banner por cima e linhas preservadas', async () => {
    mocks.pagina.push({ data: [log('a')], count: 1 });
    renderizar();
    await abrirAbaLogs();
    expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();

    mocks.pagina.push({ data: null, count: null, error: { message: 'queda de rede' } });
    fireEvent.change(screen.getByLabelText(/filtrar por ip/i), { target: { value: '10.0.0.2' } });

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('queda de rede');
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('usa a janela de estatística (não a página) no percentual e nos alertas', async () => {
    mocks.pagina.push({ data: [log('a')], count: 90 });
    mocks.stats.push({
      data: [log('a', { request_count: 1 }), log('b', { request_count: 4, blocked: true })],
    });

    renderizar();

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
    const { container } = renderizar();
    await abrirAbaLogs();

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    const semNome = results.violations.filter(v =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});

afterEach(() => cleanup());

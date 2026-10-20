import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import React from 'react';

/**
 * Painel de Consumo de IA — estados (carregando / falha) e acessibilidade.
 *
 * Antes deste cartão a tela lia `isLoading` do hook e não usava: enquanto a
 * agregação não respondia, e também quando ela FALHAVA, o admin via cartões 0,
 * "Nenhum dado no período" e gráficos vazios — indistinguível de uma janela
 * legitimamente sem chamadas. Também faltavam: nome acessível no botão só de
 * ícone de atualizar, `scope="col"` nos cabeçalhos das duas tabelas, alternativa
 * textual para os gráficos e texto (não só o símbolo ✓/✗) no status do log.
 *
 * Aqui se renderiza o componente REAL, com o hook REAL e o cliente Supabase
 * mockado — a prova é sobre o que o admin vê na tela, não sobre um mock que já
 * traz a resposta pronta. O cliente é mockado porque o app aponta para produção
 * (ver a guarda de rede em src/test/setup.ts).
 */

const RESUMO = {
  fonte: 'ai_usage_logs',
  escopo: 'permitido_ao_solicitante',
  gerado_em: '2026-10-03T07:00:00Z',
  filtros: {
    inicio: '2026-10-02T07:00:00Z', fim: '2026-10-03T07:00:00Z',
    janela_segundos: 86400, balde_segundos: 3600, limite_funcoes: 50, limite_usuarios: 20,
  },
  cobertura: {
    chamadas: 1500, primeiro_registro: '2026-10-02T07:01:00Z', ultimo_registro: '2026-10-03T06:59:00Z',
    truncado: false, chamadas_sem_tokens: 100, amostra_duracao: 1200,
    funcoes_distintas: 3, usuarios_distintos: 2,
  },
  totais: { chamadas: 1500, erros: 50, usuarios: 2, tokens: 9800, tokens_entrada: 2800, tokens_saida: 7000 },
  duracao_ms: { media: 1250, p95: 1495, amostra: 1200 },
  situacoes: { success: 1450, error: 50 },
  por_funcao: [{ funcao: 'ai-suggest-reply', chamadas: 900, tokens: 6300, erros: 0, sem_tokens: 0 }],
  por_usuario: [{ usuario: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', chamadas: 900, tokens: 6300 }],
  serie: [
    { inicio: '2026-10-03T06:00:00Z', chamadas: 40, tokens: 280, erros: 2, por_funcao: { 'ai-suggest-reply': 30 } },
  ],
};

const PAGINA = [{
  id: 'log-0', user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', profile_id: null,
  function_name: 'ai-suggest-reply', model: 'deepseek-v4-flash',
  input_tokens: 2, output_tokens: 5, total_tokens: 7, duration_ms: 1200,
  status: 'success', created_at: '2026-10-03T06:00:00Z',
}];

// `nunca` mantém a promessa pendente: é assim que se congela a tela no estado
// de carregando, sem depender de tempo real.
let falhaResumo: unknown = null;
let falhaLogs: unknown = null;
let resumoNuncaResolve = false;

vi.mock('@/integrations/supabase/client', () => {
  const construtorLista = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.range = () => Promise.resolve(
      falhaLogs ? { data: null, count: null, error: falhaLogs } : { data: PAGINA, count: 1, error: null },
    );
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => {
        if (fn === 'ai_usage_cost_summary') return Promise.resolve({ data: null, error: null });
        if (resumoNuncaResolve) return new Promise(() => {});
        return Promise.resolve(
          falhaResumo ? { data: null, error: falhaResumo } : { data: RESUMO, error: null },
        );
      },
      from: (tabela: string) =>
        tabela === 'profiles' ? { select: () => Promise.resolve({ data: [] }) } : construtorLista(),
    },
  };
});

import { AIUsageDashboard } from '@/components/admin/AIUsageDashboard';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    React.createElement(QueryClientProvider, { client }, React.createElement(AIUsageDashboard)),
  );
}

const abaLogs = () => fireEvent.mouseDown(screen.getByRole('tab', { name: 'Logs Detalhados' }));
const abaUsuarios = () => fireEvent.mouseDown(screen.getByRole('tab', { name: 'Por Usuário' }));

describe('Painel de Consumo de IA — carregando, erro e acessibilidade', () => {
  beforeEach(() => {
    falhaResumo = null;
    falhaLogs = null;
    resumoNuncaResolve = false;
  });

  it('enquanto a agregação não responde, mostra esqueleto e NÃO afirma zero', () => {
    resumoNuncaResolve = true;
    renderizar();

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.getByText('Carregando consumo de IA…')).toBeInTheDocument();
    // Nada de cartões zerados durante o carregamento: "0" seria uma afirmação falsa.
    expect(screen.queryByText('Chamadas')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha na agregação vira alerta com "Tentar de novo", e o retry recarrega de verdade', async () => {
    falhaResumo = new Error('permission denied for function ai_usage_summary');
    renderizar();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('Não foi possível carregar o consumo de IA')).toBeInTheDocument();
    expect(within(alerta).getByText(/permission denied for function ai_usage_summary/)).toBeInTheDocument();
    // O erro substitui os números: não se mostra "0" quando não houve medição.
    expect(screen.queryByText('Chamadas')).toBeNull();

    falhaResumo = null;
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(screen.getByText('Chamadas')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha na lista de logs aparece na aba Logs e o "Tentar de novo" a recupera', async () => {
    falhaLogs = new Error('statement timeout');
    renderizar();
    abaLogs();

    expect(await screen.findByText('Não foi possível buscar os logs.')).toBeInTheDocument();

    falhaLogs = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Sucesso')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível buscar os logs.')).toBeNull();
  });

  it('o botão de atualizar tem nome acessível', async () => {
    renderizar();
    await waitFor(() => expect(screen.getByText('Chamadas')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Atualizar dados de uso de IA' })).toBeInTheDocument();
  });

  it('os cabeçalhos das duas tabelas têm scope="col"', async () => {
    renderizar();
    await waitFor(() => expect(screen.getByText('Chamadas')).toBeInTheDocument());

    abaLogs();
    const tabelaLogs = screen.getByRole('table', { name: 'Registros de uso de IA' });
    const cabecalhosLogs = within(tabelaLogs).getAllByRole('columnheader');
    expect(cabecalhosLogs).toHaveLength(7);
    cabecalhosLogs.forEach(th => expect(th).toHaveAttribute('scope', 'col'));

    abaUsuarios();
    const tabelaUsuarios = screen.getByRole('table', { name: 'Ranking de consumo por usuário' });
    const cabecalhosUsuarios = within(tabelaUsuarios).getAllByRole('columnheader');
    expect(cabecalhosUsuarios).toHaveLength(5);
    cabecalhosUsuarios.forEach(th => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('o status do log não depende do símbolo: tem texto acessível', async () => {
    renderizar();
    await waitFor(() => expect(screen.getByText('Chamadas')).toBeInTheDocument());
    abaLogs();

    const tabela = screen.getByRole('table', { name: 'Registros de uso de IA' });
    expect(within(tabela).getByText('Sucesso')).toBeInTheDocument();
  });

  it('os gráficos têm resumo textual para quem não vê a área/barra', async () => {
    renderizar();
    await waitFor(() => expect(screen.getByText('Chamadas')).toBeInTheDocument());

    expect(screen.getByText(/Gráfico de chamadas ao longo do tempo:/)).toBeInTheDocument();
    expect(screen.getByText(/Distribuição por função:/)).toBeInTheDocument();

    abaUsuarios();
    expect(screen.getByText(/Ranking de consumo por usuário \(10 maiores no gráfico\):/)).toBeInTheDocument();
  });

  it('axe não acusa violação no estado de erro', async () => {
    falhaResumo = new Error('permission denied for function ai_usage_summary');
    const { container } = renderizar();
    await screen.findByRole('alert');

    const resultados = await axe(container);
    expect(resultados).toHaveNoViolations();
  });
});

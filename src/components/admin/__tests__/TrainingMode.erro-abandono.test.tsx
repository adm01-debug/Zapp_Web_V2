import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TrainingMode } from '../TrainingMode';

// PG-09 — Modo Treinamento: início, abandono e acessibilidade.
// Antes: `loadProfile` fazia `.single()` e engolia o erro (`if (data)`), então atendente
// sem perfil digitava e nada acontecia; o insert da sessão era ignorado; e "Sair" deixava
// a sessão presa em `in_progress` para sempre. A aba de resultados da equipe (admin/
// supervisor) não existia.

const ctrl = vi.hoisted(() => ({
  perfil: { data: { id: 'perfil-1' }, error: null } as { data: unknown; error: unknown },
  insercoes: 0,
  insertError: null as unknown,
  updates: [] as Record<string, unknown>[],
  updateError: null as unknown,
  sessoes: [] as unknown[],
  listaError: null as unknown,
  equipe: [] as unknown[],
  equipeError: null as unknown,
  isSupervisor: false,
}));

vi.mock('@/integrations/supabase/client', () => {
  function criarChain(tabela: string) {
    const chain: Record<string, unknown> = {};
    let op = 'select';
    let cols = '';
    chain.select = (c?: string) => { cols = c ?? ''; return chain; };
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.insert = () => { op = 'insert'; ctrl.insercoes += 1; return chain; };
    chain.update = (p: Record<string, unknown>) => { op = 'update'; ctrl.updates.push(p); return chain; };
    chain.single = () =>
      Promise.resolve(
        tabela === 'profiles'
          ? ctrl.perfil
          : ctrl.insertError
            ? { data: null, error: ctrl.insertError }
            : { data: { id: 'sessao-1' }, error: null },
      );
    chain.maybeSingle = () => Promise.resolve(ctrl.perfil);
    chain.then = (onOk: (r: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      let res: unknown;
      if (tabela === 'profiles') res = ctrl.perfil;
      else if (op === 'update') res = { data: null, error: ctrl.updateError };
      else if (cols.includes('created_at')) res = { data: ctrl.equipe, error: ctrl.equipeError };
      else res = { data: ctrl.sessoes, error: ctrl.listaError };
      return Promise.resolve(res).then(onOk, onErr);
    };
    return chain;
  }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'usuario-1' } }, error: null }) },
      from: (tabela: string) => criarChain(tabela),
    },
  };
});

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: ctrl.isSupervisor,
    isSupervisor: ctrl.isSupervisor,
    loading: false,
    roles: [],
    hasRole: () => ctrl.isSupervisor,
  }),
}));

const CENARIO = 'Reclamação sobre entrega';

const SESSAO_ANTERIOR = {
  id: 'anterior-1',
  scenario_name: 'Sessão anterior de teste',
  status: 'completed',
  score: 90,
  created_at: '2026-10-01T12:00:00.000Z',
};

const CAMPO = 'Responda como atendente...';

/** Espera o perfil carregar e abre o cenário; devolve quando o insert já voltou com o id. */
async function abrirCenario() {
  await screen.findByText(SESSAO_ANTERIOR.scenario_name);
  const antes = ctrl.insercoes;
  fireEvent.click(screen.getByText(CENARIO));
  await waitFor(() => expect(ctrl.insercoes).toBe(antes + 1));
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  ctrl.perfil = { data: { id: 'perfil-1' }, error: null };
  ctrl.insercoes = 0;
  ctrl.insertError = null;
  ctrl.updates = [];
  ctrl.updateError = null;
  ctrl.sessoes = [SESSAO_ANTERIOR];
  ctrl.listaError = null;
  ctrl.equipe = [];
  ctrl.equipeError = null;
  ctrl.isSupervisor = false;
});

describe('TrainingMode — falha de perfil e de início da sessão', () => {
  it('perfil que falha na leitura avisa na tela em vez de engolir o erro', async () => {
    ctrl.perfil = { data: null, error: { message: 'permission denied for table profiles' } };
    render(<TrainingMode />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/carregar o seu perfil/i);

    // Sem perfil não há `profile_id`: o cenário não pode abrir sessão nenhuma.
    fireEvent.click(screen.getByText(CENARIO));
    expect(await screen.findByText(/perfil ainda não carregou/i)).toBeInTheDocument();
    expect(ctrl.insercoes).toBe(0);
  });

  it('usuário sem perfil cadastrado é avisado (não é falha silenciosa)', async () => {
    ctrl.perfil = { data: null, error: null };
    render(<TrainingMode />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/não tem perfil cadastrado/i);
    expect(ctrl.insercoes).toBe(0);
  });

  it('falha ao iniciar avisa e o botão Enviar fica desabilitado (texto não é perdido)', async () => {
    ctrl.insertError = { message: 'insert failed' };
    render(<TrainingMode />);
    await abrirCenario();

    expect(await screen.findByText(/Não foi possível iniciar o treinamento/i)).toBeInTheDocument();

    const campo = screen.getByPlaceholderText(CAMPO);
    fireEvent.change(campo, { target: { value: 'Bom dia, vou verificar o pedido.' } });
    expect(screen.getByLabelText('Enviar resposta')).toBeDisabled();

    // Nem pelo Enter: sem sessão de treinamento não se grava nada.
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(ctrl.updates).toHaveLength(0);
  });

  it('erro de leitura das sessões anteriores também aparece na tela', async () => {
    ctrl.listaError = { message: 'list failed' };
    render(<TrainingMode />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/sessões de treinamento/i);
  });
});

describe('TrainingMode — sair do cenário encerra a sessão', () => {
  it('Sair grava status abandoned e a sessão deixa de ficar presa em andamento', async () => {
    render(<TrainingMode />);
    await abrirCenario();

    // O banco passa a devolver a sessão encerrada depois do update.
    ctrl.sessoes = [SESSAO_ANTERIOR, { id: 'sessao-1', scenario_name: CENARIO, status: 'abandoned', score: null }];

    fireEvent.click(screen.getByRole('button', { name: /^sair$/i }));

    await waitFor(() => expect(ctrl.updates).toContainEqual({ status: 'abandoned' }));
    // Não virou conclusão: nada de score/feedback no abandono.
    expect(ctrl.updates.every(u => u.score === undefined)).toBe(true);
    expect(await screen.findByText('Abandonada')).toBeInTheDocument();
  });

  it('falha ao registrar o abandono é avisada (não some no silêncio)', async () => {
    ctrl.updateError = { message: 'update failed' };
    render(<TrainingMode />);
    await abrirCenario();

    fireEvent.click(screen.getByRole('button', { name: /^sair$/i }));

    await waitFor(() => expect(ctrl.updates).toHaveLength(1));
    expect(await screen.findByText(/Não foi possível registrar o encerramento/i)).toBeInTheDocument();
  });
});

describe('TrainingMode — acessibilidade do cenário em andamento', () => {
  it('a conversa é uma região log e o botão de enviar tem nome acessível', async () => {
    render(<TrainingMode />);
    await abrirCenario();

    expect(screen.getByRole('log', { name: 'Conversa do treinamento' })).toBeInTheDocument();
    const enviar = screen.getByLabelText('Enviar resposta');
    expect(enviar).toBeInTheDocument();
    expect(enviar).toBeDisabled();
  });
});

describe('TrainingMode — aba "Resultados da equipe" (admin/supervisor)', () => {
  it('atendente comum não vê a aba da equipe', async () => {
    render(<TrainingMode />);
    await screen.findByText(SESSAO_ANTERIOR.scenario_name);

    expect(screen.queryByRole('tab', { name: /Resultados da equipe/i })).toBeNull();
  });

  it('supervisor vê a aba e as sessões que a RLS libera, com o estado traduzido', async () => {
    ctrl.isSupervisor = true;
    ctrl.equipe = [
      { id: 'sessao-a', scenario_name: 'Cenário do time', status: 'abandoned', score: null, created_at: '2026-10-02T12:00:00.000Z' },
      { id: 'sessao-b', scenario_name: 'Cenário do time 2', status: 'completed', score: 80, created_at: '2026-10-03T12:00:00.000Z' },
    ];
    render(<TrainingMode />);
    await screen.findByText(SESSAO_ANTERIOR.scenario_name);

    // Radix Tabs ativa no mousedown (não só no click).
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Resultados da equipe/i }));

    expect(await screen.findByText('Cenário do time 2')).toBeInTheDocument();
    expect(screen.getByText(/^Abandonada/)).toBeInTheDocument();
    expect(screen.getByText(/^Concluído/)).toBeInTheDocument();
    expect(screen.getByText('80/100')).toBeInTheDocument();
    // Sessão abandonada não tem nota: nada de "null/100".
    expect(screen.queryByText('null/100')).toBeNull();
  });

  it('falha ao ler os resultados da equipe aparece como aviso', async () => {
    ctrl.isSupervisor = true;
    ctrl.equipeError = { message: 'rls denied' };
    render(<TrainingMode />);
    await screen.findByText(SESSAO_ANTERIOR.scenario_name);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Resultados da equipe/i }));

    expect(await screen.findByText(/Não foi possível carregar os resultados da equipe/i)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X105 (TL-130) — grupos E/OU do construtor de segmento (tela 03): selo, divisor
 * entre grupos, árvore das condições e menu do grupo.
 *
 * O TalkXSegments REAL entra no teste (motor de regras real, via importOriginal);
 * só o CRUD de segmentos vira spy, para o caso de duplicar/mover/remover poder
 * conferir o JSON que sai para o banco.
 *
 * Vermelho antes (ponta dia/2026-10-09):
 *  (a) o selo do grupo vinha da POSIÇÃO — `['E','O','G'][índice]`: o 2º grupo
 *      mostrava "O" mesmo sendo AND e o 3º mostrava "G";
 *  (b) não havia divisor entre grupos (o motor combina os grupos por OU);
 *  (c) as condições eram linhas soltas: sem linha vertical, sem nó e sem ícone
 *      por tipo de campo;
 *  (d) o E/OU do grupo era um <Select> cru, sem o menu "⋯" do mock.
 */

const f = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: () => chain,
      rpc: (_name: string, args?: { p_mode?: string }) => Promise.resolve({
        data: args?.p_mode === 'page'
          ? { mode: 'page', rows: [], has_more: false, next_after: null }
          : { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      }),
    },
  };
});

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [], isLoading: false, isError: false, error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: f.create },
      updateSegment: { mutateAsync: f.update },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import { rulesJoin, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o construtor, preenche o nome e devolve o botão Publicar. */
async function abrirConstrutor(nome = 'Segmento grupos') {
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
  const nomeInput = await screen.findByPlaceholderText('Nome do segmento…');
  fireEvent.change(nomeInput, { target: { value: nome } });
  return screen.findByRole('button', { name: /Publicar segmento/ });
}

/** Abre o menu "⋯" do grupo (Radix abre no pointerdown). */
function abrirMenuDoGrupo(n: number) {
  const trigger = screen.getByRole('button', { name: `Menu do grupo ${n}` });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

/** Adiciona uma condição (campo `tags`, valor em branco) ao grupo de índice `i`. */
function adicionarCondicao(i: number) {
  const botoes = screen.getAllByRole('button', { name: '+ Adicionar condição' });
  fireEvent.click(botoes[i]);
}

/** Preenche o valor da condição de índice `i` (na ordem em que as linhas aparecem). */
function preencherValor(i: number, valor: string) {
  const campos = screen.getAllByPlaceholderText('Valor…');
  fireEvent.change(campos[i], { target: { value: valor } });
}

/** Regras que o construtor mandou para o banco ao publicar. */
async function publicarELerRegras(publicar: HTMLElement) {
  fireEvent.click(publicar);
  await waitFor(() => expect(f.create).toHaveBeenCalled());
  return (f.create.mock.calls[0][0] as { rules: SegmentRules }).rules;
}

describe('TalkXSegments · grupos E/OU do construtor (X105)', () => {
  beforeEach(() => {
    f.create.mockReset();
    f.update.mockReset();
    f.create.mockResolvedValue(undefined);
  });

  it('o selo do grupo vem do `match`, não da posição', async () => {
    await abrirConstrutor();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar grupo (AND)' }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar grupo \(OR\)/ }));

    // 2º grupo é AND: antes mostrava "O" (posição) mesmo sendo E.
    expect(screen.getByLabelText('Grupo 1: E (AND)').textContent).toBe('E');
    expect(screen.getByLabelText('Grupo 2: E (AND)').textContent).toBe('E');
    // 3º grupo é OR: antes mostrava "G".
    expect(screen.getByLabelText('Grupo 3: OU (OR)').textContent).toBe('OU');
    expect(screen.queryByText('G')).toBeNull();
  });

  it('o divisor entre grupos mostra o conector único, e some com um grupo só', async () => {
    await abrirConstrutor();

    expect(screen.queryByRole('separator', { name: /Conector entre grupos/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar grupo (AND)' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar grupo (AND)' }));

    // Um conector único para todos os vãos: o mesmo texto nos dois divisores.
    const divisores = screen.getAllByRole('separator', { name: 'Conector entre grupos: OU' });
    expect(divisores).toHaveLength(2);
    for (const divisor of divisores) expect(divisor.textContent).toBe('OU');
  });

  it('regra sem `join` gravado combina por OU (padrão do motor)', () => {
    // Regras antigas e as que o wizard monta não trazem o campo: o divisor não
    // pode prometer "E" onde a contagem/entrega fazem OU.
    expect(rulesJoin({ groups: [] })).toBe('or');
    expect(rulesJoin({ groups: [], join: 'and' })).toBe('and');
  });

  it('o menu "⋯" do grupo alterna o E/OU do grupo', async () => {
    await abrirConstrutor();

    abrirMenuDoGrupo(1);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Alternar para OU' }));

    expect(screen.getByLabelText('Grupo 1: OU (OR)').textContent).toBe('OU');
    expect(screen.getByText(/Pelo menos uma condição deve ser atendida \(OR\)/)).toBeTruthy();

    abrirMenuDoGrupo(1);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Alternar para E' }));

    expect(screen.getByLabelText('Grupo 1: E (AND)').textContent).toBe('E');
    expect(screen.getByText(/Todas as condições devem ser atendidas \(AND\)/)).toBeTruthy();
  });

  it('duplicar grupo copia as condições com ids novos', async () => {
    const publicar = await abrirConstrutor();
    adicionarCondicao(0);
    preencherValor(0, 'VIP-A');

    abrirMenuDoGrupo(1);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar grupo' }));

    // A cópia aparece na tela com a mesma condição…
    expect(screen.getByLabelText('Grupo 2: E (AND)')).toBeTruthy();
    expect(screen.getAllByDisplayValue('VIP-A')).toHaveLength(2);

    // …e no JSON que vai para o banco: ids novos no grupo e na condição, e o
    // conector entre grupos gravado junto do segmento.
    const regras = await publicarELerRegras(publicar);
    expect(regras.join).toBe('or');
    const grupos = regras.groups;
    expect(grupos).toHaveLength(2);
    expect(grupos[0].rules[0].value).toBe('VIP-A');
    expect(grupos[1].rules[0].value).toBe('VIP-A');
    expect(grupos[1].id).not.toBe(grupos[0].id);
    expect(grupos[1].rules[0].id).not.toBe(grupos[0].rules[0].id);
  });

  it('mover para cima troca a ordem dos grupos', async () => {
    const publicar = await abrirConstrutor();
    adicionarCondicao(0);
    preencherValor(0, 'A');
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar grupo (AND)' }));
    adicionarCondicao(1);
    preencherValor(1, 'B');

    abrirMenuDoGrupo(2);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para cima' }));

    const grupos = (await publicarELerRegras(publicar)).groups;
    expect(grupos.map((g) => g.rules[0].value)).toEqual(['B', 'A']);
  });

  it('remover grupo tira o grupo e nunca deixa o segmento sem nenhum', async () => {
    const publicar = await abrirConstrutor();
    adicionarCondicao(0);
    preencherValor(0, 'A');
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar grupo (AND)' }));
    adicionarCondicao(1);
    preencherValor(1, 'B');

    abrirMenuDoGrupo(2);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover grupo' }));
    expect(screen.queryByLabelText('Grupo 2: E (AND)')).toBeNull();

    // Com um grupo só, o item fica desabilitado e o handler recusa: o segmento
    // continua com o grupo que sobrou.
    abrirMenuDoGrupo(1);
    const remover = await screen.findByRole('menuitem', { name: 'Remover grupo' });
    expect(remover).toHaveAttribute('data-disabled');
    fireEvent.click(remover);

    const grupos = (await publicarELerRegras(publicar)).groups;
    expect(grupos).toHaveLength(1);
    expect(grupos[0].rules[0].value).toBe('A');
  });

  it('a árvore liga as condições e cada tipo de campo tem o seu ícone', async () => {
    const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TalkXSegments onUseCampaign={() => {}} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));

    // lead_score/risk_score são "em breve" (coluna nunca calculada): o botão
    // continua visível com o MESMO nome acessível, mas desabilitado — clicar
    // não adiciona condição (filtro morto removido).
    const leadScore = screen.getByRole('button', { name: 'Lead score' });
    expect(leadScore).toBeDisabled();
    expect(leadScore).toHaveAttribute('title', expect.stringContaining('Em breve'));
    fireEvent.click(leadScore);
    expect(screen.queryByLabelText('Valor da condição')).toBeNull();

    // O catálogo de filtros adiciona a condição com o campo — e o campo traz o tipo.
    for (const filtro of ['Empresa', 'Data de cadastro', 'Responsável', 'Tipo do contato']) {
      fireEvent.click(screen.getByRole('button', { name: filtro }));
    }
    adicionarCondicao(0);

    // Ícone por tipo de campo (text, date, uuid, enum, array — sem o number do
    // lead_score "em breve", que não entra na árvore).
    for (const icone of ['type', 'calendar-days', 'user', 'list-filter', 'tags']) {
      expect(container.querySelector(`svg.lucide-${icone}`), `ícone ${icone}`).not.toBeNull();
    }

    // Linha vertical com um nó por condição.
    expect(container.querySelector('[data-talkx-line]')).not.toBeNull();
    expect(container.querySelectorAll('[data-talkx-node]')).toHaveLength(5);
  });
});

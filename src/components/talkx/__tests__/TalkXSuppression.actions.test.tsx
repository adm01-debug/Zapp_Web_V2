/**
 * X181 (TL-167) — ações de linha (⋮), seleção em massa e modais de editar e
 * remover da lista de supressão do Talk X.
 *
 * O que o cartão cobrava: a linha só tinha um botão "Remover" dentro de um
 * `<AlertDialog>` vazio, a remoção não tinha `onError` e não existia edição de
 * motivo/expiração, reativação nem seleção em massa.
 *
 * O teste monta a TELA real e passa pelo caminho do usuário: abre o menu da
 * linha, escolhe a ação, confirma no modal do kit e confere a ÚNICA atualização
 * que chega ao banco (payload + ids). Vermelho antes: o menu não existia, o
 * modal de editar não existia, não havia checkbox nem reativar.
 *
 * Situações cobertas: ativo (manual), opt-out, expirado, com campanha e
 * telefone avulso (sem contato vinculado).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O gatilho do Select (Radix) chama `hasPointerCapture` no pointerdown que o
// abre; o menu do ⋮ mede o trigger por `scrollIntoView`.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ payload: Record<string, unknown>; column: string; ids: string[] }>,
  updateError: null as Error | null,
}));

// "Ver contato" sem callback usa o mecanismo do produto (`open-contact-chat`,
// o mesmo das Tarefas e do Catálogo) — o spy prova esse caminho.
const openContactChat = vi.hoisted(() => vi.fn());
vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, info: vi.fn() } }));

vi.mock('@/hooks/integrations/useTalkXSuppression', () => ({
  SUPPRESSION_ACTIVITY_EVENT_TYPES: [
    'suppression_add',
    'suppression_remove',
    'suppression_update',
    'suppression_import',
    'suppression_export',
  ],
  useTalkXSuppressionActivity: () => ({
    isLoading: false,
    isError: false,
    items: [],
    total: 0,
    refetch: vi.fn(),
  }),
  useTalkXSuppressionStats: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const listBuilder = () => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.not = () => self;
    self.order = () => Promise.resolve({ data: h.rows, error: null });
    self.limit = () => Promise.resolve({ data: [], error: null });
    return self;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table !== 'talkx_blacklist') return listBuilder();
        const self: Record<string, unknown> = {};
        self.select = () => self;
        self.is = () => self;
        self.order = () => Promise.resolve({ data: h.rows, error: null });
        self.update = (payload: Record<string, unknown>) => ({
          in: (column: string, ids: string[]) => {
            h.updates.push({ payload, column, ids });
            return Promise.resolve({ error: h.updateError });
          },
        });
        return self;
      },
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: () => Promise.resolve({ error: null }),
    update: (payload: Record<string, unknown>) => ({
      in: (column: string, ids: string[]) => {
        h.updates.push({ payload, column, ids });
        return Promise.resolve({ error: h.updateError });
      },
    }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'auth-user-1' },
    profile: { id: 'profile-1' },
    session: {},
    loading: false,
  }),
}));

import { TalkXSuppression } from '@/components/talkx/TalkXSuppression';

function linha(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'bl-x',
    contact_id: null,
    phone: null,
    reason: null,
    reason_code: 'manual',
    blocked_by: null,
    created_at: '2026-10-01T10:00:00.000Z',
    origin: 'manual',
    campaign_id: null,
    expires_at: null,
    removed_by: null,
    removed_at: null,
    contacts: null,
    ...over,
  };
}

const contato = (name: string, phone: string) => ({ name, phone, company: null, avatar_url: null });

const ATIVO = linha({
  id: 'bl-1',
  contact_id: 'c1',
  reason: 'Bloqueio manual',
  origin: 'manual',
  contacts: contato('Ana Souza', '5511987654321'),
});
const OPTOUT = linha({
  id: 'bl-2',
  contact_id: 'c2',
  reason: 'Opt-out solicitado',
  reason_code: 'opt_out',
  origin: 'optout',
  contacts: contato('Bruno Lima', '5511976543210'),
});
const EXPIRADO = linha({
  id: 'bl-3',
  contact_id: 'c3',
  reason: 'Bloqueio manual',
  expires_at: '2026-09-01T00:00:00.000Z',
  contacts: contato('Carla Dias', '5511955554444'),
});
const COM_CAMPANHA = linha({
  id: 'bl-4',
  contact_id: 'c4',
  reason: 'Opt-out solicitado',
  reason_code: 'opt_out',
  origin: 'optout',
  campaign_id: 'camp-1',
  contacts: contato('Dora Reis', '5511944443333'),
});
const AVULSO = linha({
  id: 'bl-5',
  contact_id: null,
  phone: '5511999998888',
  reason: 'Bloqueio manual',
});

function renderView(
  props: { onOpenContact?: (id: string) => void; onOpenCampaign?: (id: string) => void } = {}
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXSuppression {...props} />
    </QueryClientProvider>
  );
}

/** Abre o menu ⋮ da linha pelo teclado, como o usuário faria no trigger. */
const abrirMenu = (nome: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name: `Ações de ${nome}` }), { key: 'ArrowDown' });

/** Escolhe uma opção no Select real (Radix) do modal. */
function escolher(combobox: HTMLElement, opcao: string) {
  fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

beforeEach(() => {
  h.rows = [ATIVO, OPTOUT, EXPIRADO, COM_CAMPANHA, AVULSO];
  h.updates = [];
  h.updateError = null;
  toastSuccess.mockReset();
  toastError.mockReset();
  openContactChat.mockReset();
});

describe('X181 — ações de linha, seleção em massa e modais (TL-167)', () => {
  it('a linha ativa tem o menu ⋮ do plano e não oferece Reativar', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    abrirMenu('Ana Souza');

    const itens = screen.getAllByRole('menuitem').map((i) => (i.textContent ?? '').trim());
    expect(itens).toEqual(['Editar motivo e expiração', 'Ver contato', 'Remover da lista']);
    expect(screen.queryByRole('menuitem', { name: 'Reativar' })).toBeNull();
  });

  it('Editar motivo e expiração grava reason_code e expires_at na linha', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    abrirMenu('Ana Souza');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));

    const dialog = await screen.findByRole('dialog');
    escolher(
      within(dialog).getByRole('combobox', { name: 'Motivo' }),
      'LGPD / revogação de consentimento'
    );
    escolher(within(dialog).getByRole('combobox', { name: 'Expiração' }), '30 dias');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].column).toBe('id');
    expect(h.updates[0].ids).toEqual(['bl-1']);
    expect(h.updates[0].payload).toMatchObject({
      reason_code: 'lgpd',
      reason: 'LGPD / revogação de consentimento',
    });
    expect(typeof h.updates[0].payload.expires_at).toBe('string');
    expect(new Date(h.updates[0].payload.expires_at as string).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it('bloqueia edição que rebaixa opt-out/LGPD sem a confirmação obrigatória', async () => {
    renderView();
    await screen.findByText('Bruno Lima');

    abrirMenu('Bruno Lima');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));

    const dialog = await screen.findByRole('dialog');
    escolher(within(dialog).getByRole('combobox', { name: 'Motivo' }), 'Bloqueio manual');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Opt-out/LGPD'))
    );
    expect(h.updates).toHaveLength(0);
  });

  it('bloqueia data passada em "Em uma data" e não atualiza a linha', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    abrirMenu('Ana Souza');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));

    const dialog = await screen.findByRole('dialog');
    escolher(within(dialog).getByRole('combobox', { name: 'Expiração' }), 'Em uma data');
    const input = within(dialog).getByLabelText('Data de expiração') as HTMLInputElement;
    expect(input.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fireEvent.change(input, { target: { value: yesterday } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('hoje em diante'))
    );
    expect(h.updates).toHaveLength(0);
  });

  it('expiração "Nunca expira" limpa o expires_at da linha', async () => {
    renderView();
    await screen.findByText('Carla Dias');

    abrirMenu('Carla Dias');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));

    const dialog = await screen.findByRole('dialog');
    escolher(within(dialog).getByRole('combobox', { name: 'Expiração' }), 'Nunca expira');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids).toEqual(['bl-3']);
    expect(h.updates[0].payload.expires_at).toBeNull();
  });

  it('"Ver contato" chama o callback do TalkXView com o contato da linha', async () => {
    const onOpenContact = vi.fn();
    renderView({ onOpenContact });
    await screen.findByText('Ana Souza');

    abrirMenu('Ana Souza');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver contato' }));

    expect(onOpenContact).toHaveBeenCalledWith('c1');
    expect(openContactChat).not.toHaveBeenCalled();
  });

  it('sem callback, "Ver contato" usa o mecanismo do produto e fica desabilitado para telefone avulso', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    abrirMenu('Ana Souza');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver contato' }));
    expect(openContactChat).toHaveBeenCalledWith('c1');

    abrirMenu('+5511999998888');
    expect(screen.getByRole('menuitem', { name: 'Ver contato' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('"Ver campanha" só aparece quando a linha tem campanha', async () => {
    const onOpenCampaign = vi.fn();
    renderView({ onOpenCampaign });
    await screen.findByText('Dora Reis');

    abrirMenu('Dora Reis');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver campanha' }));
    expect(onOpenCampaign).toHaveBeenCalledWith('camp-1');

    abrirMenu('Ana Souza');
    expect(screen.queryByRole('menuitem', { name: 'Ver campanha' })).toBeNull();
  });

  it('remover opt-out exige a confirmação marcada e o aviso de sucesso tem "Desfazer"', async () => {
    renderView();
    await screen.findByText('Bruno Lima');

    abrirMenu('Bruno Lima');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover da lista' }));

    const dialog = await screen.findByRole('alertdialog');
    const confirmar = within(dialog).getByRole('button', { name: 'Remover' });
    expect(confirmar).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids).toEqual(['bl-2']);
    expect(h.updates[0].payload).toMatchObject({ removed_by: 'profile-1' });
    expect(h.updates[0].payload.removed_at).toBeTruthy();

    // "Desfazer" (10 s) devolve a linha ao estado ativo — removed_at nulo.
    const comDesfazer = toastSuccess.mock.calls.find(
      (c) => (c[1] as { action?: { label?: string } } | undefined)?.action?.label === 'Desfazer'
    );
    expect(comDesfazer).toBeTruthy();
    (comDesfazer![1] as { action: { onClick: () => void } }).action.onClick();

    await waitFor(() => expect(h.updates).toHaveLength(2));
    expect(h.updates[1].payload).toEqual({ removed_by: null, removed_at: null });
    expect(h.updates[1].ids).toEqual(['bl-2']);
  });

  it('Reativar aparece no expirado e limpa removed_at e expires_at', async () => {
    renderView();
    await screen.findByText('Carla Dias');
    expect(screen.getAllByText('Expirado')).toHaveLength(1);

    abrirMenu('Carla Dias');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reativar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids).toEqual(['bl-3']);
    expect(h.updates[0].payload).toEqual({ removed_by: null, removed_at: null, expires_at: null });
  });

  it('selecionar 3 linhas e remover manda os 3 ids em uma única atualização', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno Lima' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Carla Dias' }));
    expect(screen.getByText('3 selecionadas')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    const dialog = await screen.findByRole('alertdialog');
    // a seleção tem um opt-out: a confirmação é obrigatória
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids.slice().sort()).toEqual(['bl-1', 'bl-2', 'bl-3']);
  });

  it('"Alterar motivo" da barra de massa atualiza a seleção inteira de uma vez', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Carla Dias' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alterar motivo' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Editar 2 contatos suprimidos')).toBeTruthy();
    escolher(within(dialog).getByRole('combobox', { name: 'Motivo' }), 'Sem permissão comercial');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids.slice().sort()).toEqual(['bl-1', 'bl-3']);
    expect(h.updates[0].payload).toMatchObject({ reason_code: 'no_commercial_permission' });
    expect(h.updates[0].payload).not.toHaveProperty('expires_at');
  });

  it('edição em massa não rebaixa opt-out/LGPD para manual em silêncio', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno Lima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alterar motivo' }));

    const dialog = await screen.findByRole('dialog');
    escolher(within(dialog).getByRole('combobox', { name: 'Motivo' }), 'Bloqueio manual');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Opt-out/LGPD'))
    );
    expect(h.updates).toHaveLength(0);
  });

  it('remoção em massa usa texto de confirmação da seleção no plural', async () => {
    renderView();
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno Lima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByLabelText(/esta seleção pediu para sair/)).toBeTruthy();
  });

  it('abre a data de expiração convertida para a data local do usuário', async () => {
    h.rows = [
      linha({
        id: 'bl-date',
        contact_id: 'c-date',
        reason: 'Bloqueio manual',
        expires_at: '2026-10-10T02:30:00.000Z',
        contacts: contato('Data Local', '5511911112222'),
      }),
    ];
    renderView();
    await screen.findByText('Data Local');

    abrirMenu('Data Local');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Data de expiração') as HTMLInputElement;
    const local = new Date('2026-10-10T02:30:00.000Z');
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(input.value).toBe(expected);
  });

  it('erro da mutação aparece em aviso, não em sucesso', async () => {
    h.updateError = new Error('permissão negada');
    renderView();
    await screen.findByText('Carla Dias');

    abrirMenu('Carla Dias');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reativar' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('permissão negada'))
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

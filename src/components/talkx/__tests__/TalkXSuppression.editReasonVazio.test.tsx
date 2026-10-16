/**
 * t_8337aed3 (filho do TL-167 / t_71f45b18) — o Select de Motivo do modal
 * "Editar motivo e expiração" NÃO pode ter uma opção com `value=""` (o Radix
 * proíbe `<Select.Item value="">` e a opção vazia vira lixo na lista) quando a
 * linha não tem motivo (`reason` null/undefined).
 *
 * O teste monta a TELA real (não mocka `TalkXSuppression`), abre o modal pela
 * mesma trilha do usuário (menu ⋮ → Editar motivo e expiração) e ABRE o dropdown
 * de Motivo: é ao abrir que o Radix monta os itens, então antes disso a lista
 * nem existe e a checagem não teria valor. As asserções leem os itens
 * RENDERIZADOS (`role=option`) e o estado real do gatilho (`data-placeholder`,
 * que o Radix marca quando o valor controlado é vazio), não um array mockado —
 * um item a mais, um item a menos, um item com rótulo vazio ou um Select sem
 * valor real derrubam o teste (ver prova por mutação no relato).
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
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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
    // HZ2-013: a lista de supressão encadeia `.order()` duas vezes (desempate por
    // `id`) e fecha com `.range()` — a cadeia emulada precisa aceitar isso e
    // continuar thenable, resolvendo as MESMAS linhas de antes.
    self.order = () => {
      const done = Object.assign(Promise.resolve({ data: h.rows, error: null }), {
        order: () => done,
        range: () => done,
      });
      return done;
    };
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
        // HZ2-013: a lista de supressão encadeia `.order()` duas vezes (desempate por
    // `id`) e fecha com `.range()` — a cadeia emulada precisa aceitar isso e
    // continuar thenable, resolvendo as MESMAS linhas de antes.
    self.order = () => {
      const done = Object.assign(Promise.resolve({ data: h.rows, error: null }), {
        order: () => done,
        range: () => done,
      });
      return done;
    };
        self.update = (payload: Record<string, unknown>) => ({
          in: (column: string, ids: string[]) => {
            h.updates.push({ payload, column, ids });
            return Promise.resolve({ error: null });
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
        return Promise.resolve({ error: null });
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

/** Rótulos de motivos que o modal oferece (REASON_CODES do componente). */
const ROTULOS_ESPERADOS = [
  'Opt-out solicitado',
  'Número inválido / bounce',
  'Bounce do provedor',
  'Sem permissão comercial',
  'LGPD / revogação de consentimento',
  'Bloqueio manual',
];

const contato = (name: string, phone: string) => ({ name, phone, company: null, avatar_url: null });

function linha(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'bl-x',
    contact_id: null,
    phone: null,
    reason: null,
    reason_code: null,
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

function renderView() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXSuppression />
    </QueryClientProvider>
  );
}

/** Abre o menu ⋮ da linha pelo teclado, como o usuário faria no trigger. */
const abrirMenu = (nome: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name: `Ações de ${nome}` }), { key: 'ArrowDown' });

/** Abre um Select real (Radix) pelo pointerdown no gatilho. */
const abrirDropdown = (combobox: HTMLElement) =>
  fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: 'mouse' });

/** Itens de motivo RENDERIZADOS (o Radix monta o conteúdo no portal, ao abrir). */
function itensDeMotivo(): HTMLElement[] {
  return screen.getAllByRole('option');
}

/** Abre o modal de edição da linha e o dropdown de Motivo. Devolve o dialog. */
async function abrirModalEMotivo(nome: string): Promise<{ dialog: HTMLElement; combobox: HTMLElement }> {
  abrirMenu(nome);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));
  const dialog = await screen.findByRole('dialog');
  const combobox = within(dialog).getByRole('combobox', { name: 'Motivo' });
  abrirDropdown(combobox);
  await screen.findByRole('listbox');
  return { dialog, combobox };
}

beforeEach(() => {
  h.updates = [];
});

describe('t_8337aed3 — Select de Motivo sem opção de value vazio', () => {
  it('linha com reason null: abre o modal e a lista de motivos sem item vazio', async () => {
    const erroConsole = vi.spyOn(console, 'error');
    h.rows = [
      linha({
        id: 'bl-null',
        contact_id: 'c-null',
        reason: null,
        reason_code: null,
        contacts: contato('Ana Sem Motivo', '5511900000001'),
      }),
    ];

    renderView();
    await screen.findByText('Ana Sem Motivo');

    // abrir o modal e o dropdown não pode lançar (Radix rejeita item vazio)
    expect(() => {
      abrirMenu('Ana Sem Motivo');
      fireEvent.click(screen.getByRole('menuitem', { name: 'Editar motivo e expiração' }));
    }).not.toThrow();
    const dialog = await screen.findByRole('dialog');
    const combobox = within(dialog).getByRole('combobox', { name: 'Motivo' });
    expect(() => abrirDropdown(combobox)).not.toThrow();
    await screen.findByRole('listbox');

    const rotulos = itensDeMotivo().map((o) => (o.textContent ?? '').trim());
    // nenhum item em branco (o defeito empurrava `reason ?? ''` como opção)
    expect(rotulos).not.toContain('');
    // a lista é exatamente a dos motivos: um item a mais (o vazio) ou a menos falha
    expect(rotulos).toEqual(ROTULOS_ESPERADOS);

    // valor controlado consistente: o Radix marca `data-placeholder` no gatilho
    // quando o valor selecionado é vazio; aqui cai no motivo padrão quando a
    // linha não tem `reason_code`.
    expect(combobox).not.toHaveAttribute('data-placeholder');
    expect(combobox.textContent).toContain('Bloqueio manual');

    expect(erroConsole).not.toHaveBeenCalled();
    erroConsole.mockRestore();
  });

  it('linha sem a chave reason (undefined) também não produz item vazio e salva o motivo escolhido', async () => {
    const semReason = linha({
      id: 'bl-undef',
      contact_id: 'c-undef',
      contacts: contato('Bruno Sem Motivo', '5511900000002'),
    });
    delete (semReason as Record<string, unknown>).reason;
    h.rows = [semReason];

    renderView();
    await screen.findByText('Bruno Sem Motivo');

    const { dialog, combobox } = await abrirModalEMotivo('Bruno Sem Motivo');
    const rotulos = itensDeMotivo().map((o) => (o.textContent ?? '').trim());
    expect(rotulos).not.toContain('');
    expect(rotulos).toEqual(ROTULOS_ESPERADOS);
    expect(combobox).not.toHaveAttribute('data-placeholder');

    // e o motivo real continua selecionável e persistível a partir desse estado
    fireEvent.click(screen.getByRole('option', { name: 'LGPD / revogação de consentimento' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids).toEqual(['bl-undef']);
    expect(h.updates[0].payload).toMatchObject({
      reason_code: 'lgpd',
      reason: 'LGPD / revogação de consentimento',
    });
  });

  it('linha com motivo real: a lista traz os motivos, o atual é o marcado e a troca é gravada', async () => {
    h.rows = [
      linha({
        id: 'bl-real',
        contact_id: 'c-real',
        reason: 'Bloqueio manual',
        reason_code: 'manual',
        contacts: contato('Carla Com Motivo', '5511900000003'),
      }),
    ];

    renderView();
    await screen.findByText('Carla Com Motivo');

    const { dialog, combobox } = await abrirModalEMotivo('Carla Com Motivo');
    expect(itensDeMotivo().map((o) => (o.textContent ?? '').trim())).toEqual(ROTULOS_ESPERADOS);
    expect(combobox).not.toHaveAttribute('data-placeholder');
    expect(combobox.textContent).toContain('Bloqueio manual');

    // a opção do código atual é a marcada no Radix
    expect(screen.getByRole('option', { name: 'Bloqueio manual' })).toHaveAttribute(
      'data-state',
      'checked'
    );

    fireEvent.click(screen.getByRole('option', { name: 'Sem permissão comercial' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0].ids).toEqual(['bl-real']);
    expect(h.updates[0].payload).toMatchObject({
      reason_code: 'no_commercial_permission',
      reason: 'Sem permissão comercial',
    });
  });
});

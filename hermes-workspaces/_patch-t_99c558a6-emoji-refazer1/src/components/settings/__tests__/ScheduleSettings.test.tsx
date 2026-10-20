import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Item 273-A / R2-AUTH-049 — "Aba Horário passa a governar business_hours por
// conexão".
//
// A aba Horário gravava `user_settings.business_hours_*|work_days` (linha
// PESSOAL do operador) enquanto o contrato versionado de horário é a tabela
// `business_hours` POR CONEXÃO, lida pelo RPC `is_within_business_hours`.
// O teste prova o contrato novo: seletor de conexão no topo (padrão = conexão
// `is_default`), edição por dia da semana e gravação SÓ em `business_hours`.
//
// Dados 100% sintéticos; o cliente Supabase é falso e registra o que foi
// tocado/gravado (mesmo padrão de SkillBasedRoutingSettings.test.tsx, que
// também troca os primitivos do Radix <Select> por um <select> nativo que
// repassa o evento para o `onValueChange` REAL do componente).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  fromCalls: [] as string[],
  eqFilters: [] as Array<{ table: string; column: string; value: unknown }>,
  upserts: [] as Array<{ table: string; payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  toasts: [] as Array<Record<string, unknown>>,
  failBusinessHoursUpsert: false,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children,
  }: {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <select value={value ?? defaultValue ?? ''} onChange={e => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (arg: Record<string, unknown>) => {
    h.toasts.push(arg);
  },
  useToast: () => ({
    toast: (arg: Record<string, unknown>) => {
      h.toasts.push(arg);
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

// O seletor usa `useConnectionsManager` (o hook dono da lista de conexões, o
// mesmo apontado no cartão); ele compõe a Evolution API para as ações do painel
// de conexões, que não fazem parte deste cartão.
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => {
  // Duas conexões SINTÉTICAS: `wc2` (Vendas) é a padrão e vem DEPOIS de `wc1`
  // na lista — assim só passar "a primeira da lista" não passa no teste.
  const connections = [
    { id: 'wc1', name: 'Suporte', status: 'connected', is_default: false },
    { id: 'wc2', name: 'Vendas', status: 'connected', is_default: true },
  ];
  const hoursByConnection: Record<string, unknown[]> = {
    wc1: [
      { id: 'bh-wc1-1', whatsapp_connection_id: 'wc1', day_of_week: 1, is_open: true, open_time: '07:00', close_time: '13:00' },
    ],
    wc2: [
      { id: 'bh-wc2-1', whatsapp_connection_id: 'wc2', day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
      { id: 'bh-wc2-2', whatsapp_connection_id: 'wc2', day_of_week: 2, is_open: true, open_time: '08:00', close_time: '12:00' },
    ],
  };

  // Canal de realtime do `useConnectionsManager` (não é o alvo deste cartão).
  const realtimeChannel: Record<string, unknown> = {
    on: () => realtimeChannel,
    subscribe: () => realtimeChannel,
    unsubscribe: () => {},
  };

  const from = (table: string) => {
    h.fromCalls.push(table);
    let eqValue: unknown;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        h.eqFilters.push({ table, column, value });
        eqValue = value;
        return builder;
      },
      order: () =>
        Promise.resolve({
          data: table === 'whatsapp_connections' ? connections : hoursByConnection[eqValue as string] ?? [],
          error: null,
        }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
        h.upserts.push({ table, payload, options });
        if (table === 'business_hours' && h.failBusinessHoursUpsert) {
          return Promise.resolve({ error: { message: 'falha simulada' } });
        }
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        h.upserts.push({ table, payload, options: { kind: 'update' } });
        return Promise.resolve({ error: null });
      },
    };
    return builder;
  };

  return { supabase: { from, channel: () => realtimeChannel, removeChannel: () => Promise.resolve('ok') } };
});

import { ScheduleSettings } from '../ScheduleSettings';

function renderSchedule() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<ScheduleSettings />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/** O <select> que contém a opção pedida (o nome dele vem do conteúdo, não da posição). */
function comboComOpcao(texto: string): HTMLSelectElement {
  const combo = screen
    .getAllByRole('combobox')
    .find(c => within(c).queryByRole('option', { name: texto }));
  if (!combo) throw new Error(`Nenhum seletor de conexão com a opção "${texto}"`);
  return combo as HTMLSelectElement;
}

const valorDoCampo = (nome: string) => (screen.getByLabelText(nome) as HTMLInputElement).value;

const upsertsBusinessHours = () => h.upserts.filter(u => u.table === 'business_hours');

describe('ScheduleSettings — horário por conexão em business_hours (item 273-A)', () => {
  beforeEach(() => {
    h.fromCalls.length = 0;
    h.eqFilters.length = 0;
    h.upserts.length = 0;
    h.toasts.length = 0;
    h.failBusinessHoursUpsert = false;
  });

  it('abre o dia, muda o horário e grava a semana em business_hours da conexão padrão', async () => {
    renderSchedule();

    // Padrão = conexão `is_default` (wc2), não a primeira da lista.
    const combo = await waitFor(() => comboComOpcao('Vendas'));
    expect(combo.value).toBe('wc2');

    // O horário que voltou do banco aparece nos campos do dia.
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('09:00'));

    // "Sábado" não tem linha no banco => fechado; abrir o dia e definir o horário.
    fireEvent.click(screen.getByRole('switch', { name: 'Sábado aberto' }));
    fireEvent.change(screen.getByLabelText('Sábado abertura'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('Sábado fechamento'), { target: { value: '15:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvar Horários/i }));

    await waitFor(() => expect(upsertsBusinessHours().length).toBeGreaterThan(0));

    const sabado = upsertsBusinessHours().find(u => u.payload.day_of_week === 6);
    expect(sabado).toBeTruthy();
    expect(sabado!.payload).toEqual({
      whatsapp_connection_id: 'wc2',
      day_of_week: 6,
      is_open: true,
      open_time: '10:30',
      close_time: '15:00',
    });
    expect(sabado!.options).toEqual({ onConflict: 'whatsapp_connection_id,day_of_week' });

    // Nenhum valor fora do contrato chega ao upsert: semana 0-6, um por dia,
    // is_open booleano e horários HH:MM.
    expect(upsertsBusinessHours().map(u => u.payload.day_of_week)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const gravação of upsertsBusinessHours()) {
      expect(gravação.payload.whatsapp_connection_id).toBe('wc2');
      expect(typeof gravação.payload.is_open).toBe('boolean');
      expect(gravação.payload.open_time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(gravação.payload.close_time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(gravação.options).toEqual({ onConflict: 'whatsapp_connection_id,day_of_week' });
    }
  });

  it('não grava nada em user_settings (a aba deixou de ser preferência pessoal)', async () => {
    renderSchedule();
    await waitFor(() => comboComOpcao('Vendas'));
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('09:00'));

    fireEvent.click(screen.getByRole('switch', { name: 'Segunda-feira aberto' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar Horários/i }));

    await waitFor(() => expect(upsertsBusinessHours().length).toBeGreaterThan(0));

    expect(h.fromCalls).not.toContain('user_settings');
    expect([...new Set(h.upserts.map(u => u.table))]).not.toContain('user_settings');
    // O dia fechado também vai para o banco como fechado (contrato por dia).
    const segunda = upsertsBusinessHours().find(u => u.payload.day_of_week === 1);
    expect(segunda!.payload.is_open).toBe(false);
  });

  it('trocar o seletor recarrega o horário da outra conexão', async () => {
    renderSchedule();
    const combo = await waitFor(() => comboComOpcao('Vendas'));

    // wc2 (padrão): terça aberta 08:00.
    await waitFor(() => expect(valorDoCampo('Terça-feira abertura')).toBe('08:00'));

    fireEvent.change(combo, { target: { value: 'wc1' } });

    // wc1: segunda 07:00 e terça sem linha no banco => fechada.
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('07:00'));
    expect(screen.queryByLabelText('Terça-feira abertura')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Terça-feira aberto' })).toHaveAttribute('aria-checked', 'false');
    expect(h.eqFilters).toContainEqual({ table: 'business_hours', column: 'whatsapp_connection_id', value: 'wc1' });
  });

  it('o texto da aba não promete envio de mensagem de ausência', async () => {
    renderSchedule();
    await waitFor(() => comboComOpcao('Vendas'));

    expect(screen.queryByText(/ausência/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fora do horário/i)).not.toBeInTheDocument();
    expect(screen.getByText(/is_within_business_hours/)).toBeInTheDocument();
  });

  it('falha do upsert aparece na tela e não é confirmada como salva', async () => {
    h.failBusinessHoursUpsert = true;
    renderSchedule();
    await waitFor(() => comboComOpcao('Vendas'));
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('09:00'));

    fireEvent.change(screen.getByLabelText('Segunda-feira abertura'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Horários/i }));

    await waitFor(() => expect(h.toasts.some(t => t.variant === 'destructive')).toBe(true));
    expect(h.toasts.some(t => t.title === 'Configurações salvas')).toBe(false);
    // A falha mantém o rascunho: o que o usuário digitou continua na tela.
    expect(valorDoCampo('Segunda-feira abertura')).toBe('11:00');
  });

  it('limpar o horário de um dia aberto bloqueia o salvar e mostra erro na tela', async () => {
    renderSchedule();
    await waitFor(() => comboComOpcao('Vendas'));
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('09:00'));

    // O usuário limpa a abertura de um dia ABERTO (o campo de hora aceita vazio).
    fireEvent.change(screen.getByLabelText('Segunda-feira abertura'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Horários/i }));

    // O salvar terminou: sem a validação o upsert inválido JÁ saiu; com ela o
    // erro já está na tela. Só depois disso as duas provas são comparáveis.
    await waitFor(() =>
      expect(upsertsBusinessHours().length > 0 || screen.queryByRole('alert') !== null).toBe(true)
    );

    // NENHUM valor fora do contrato chega ao upsert de business_hours...
    expect(upsertsBusinessHours()).toHaveLength(0);

    // ...e o erro aparece na tela, apontando o dia aberto com horário em falta.
    const erro = screen.getByRole('alert');
    expect(erro).toHaveTextContent('Segunda-feira');
    expect(erro).toHaveTextContent(/HH:MM/);
    expect(h.toasts.some(t => t.title === 'Configurações salvas')).toBe(false);
    expect(h.toasts.some(t => t.variant === 'destructive')).toBe(false);
  });

  it('salvar com sucesso zera o rascunho e a tela volta ao que veio do banco', async () => {
    renderSchedule();
    await waitFor(() => comboComOpcao('Vendas'));
    await waitFor(() => expect(valorDoCampo('Segunda-feira abertura')).toBe('09:00'));

    // Sábado não tem linha no banco: abre com horário e salva.
    fireEvent.click(screen.getByRole('switch', { name: 'Sábado aberto' }));
    fireEvent.change(screen.getByLabelText('Sábado abertura'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('Sábado fechamento'), { target: { value: '15:00' } });
    expect(screen.getByRole('switch', { name: 'Sábado aberto' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Salvar Horários/i }));
    await waitFor(() => expect(h.toasts.some(t => t.title === 'Configurações salvas')).toBe(true));

    // Rascunho zerado: a tela recarrega do banco e o sábado volta fechado.
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Sábado aberto' })).toHaveAttribute('aria-checked', 'false')
    );
    expect(screen.queryByLabelText('Sábado abertura')).toBeNull();
  });
});

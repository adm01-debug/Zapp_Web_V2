import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

// R2-MOD-003 (#386): o editor de automação fechava sem aguardar a confirmação da
// persistência. O `AutomationsManager.handleSave` é `async` mas chamava
// `mutation.mutate`, que é fire-and-forget: o `await onSave(...)` do diálogo
// resolvia com `undefined` na hora, `onOpenChange(false)` fechava o diálogo e
// só depois — na resposta do banco — vinha o toast de erro. Estes testes provam
// o contrato pelo componente REAL (`AutomationsManager` + `AutomationEditorDialog`
// + `useAutomations` reais) com a persistência do Supabase controlada pelo teste:
//   1. uma Promise de persistência pendente mantém o diálogo aberto (e o botão
//      desabilitado) e ele fecha só depois da confirmação;
//   2. rejeição mantém o diálogo aberto com os campos digitados preservados;
//   3. o mesmo vale para o caminho de edição (updateMutation).

const hoisted = vi.hoisted(() => {
  const api = {
    rows: [] as unknown[],
    next: null as null | { promise: Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void },
    make() {
      let resolve!: (v: unknown) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
      api.next = { promise, resolve, reject };
      return api.next;
    },
  };
  return api;
});

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('sonner', () => ({ toast: mockToast }));

// Persistência controlada pelo teste: a query lista `hoisted.rows` e insert/update
// devolvem a Promise pendente criada por `hoisted.make()`.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: hoisted.rows, error: null }) }),
      insert: () => ({ select: () => ({ single: () => hoisted.next!.promise }) }),
      update: () => ({ eq: () => hoisted.next!.promise }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <div {...(props as any)}>{children as ReactNode}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} />
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" data-value={value} onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
  };
});

import { AutomationsManager } from '../AutomationsManager';
import type { AutomationRow } from '../useAutomations';

const NOTE_NAME = 'Ex: Boas-vindas Automáticas';

function buildRow(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: 'auto-1',
    name: 'Boas-vindas',
    description: 'desc',
    is_active: true,
    trigger_type: 'new_message',
    trigger_config: {},
    actions: [{ type: 'send_message', config: { message: 'Olá!' } }],
    created_by: null,
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AutomationRow;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AutomationsManager />
    </QueryClientProvider>
  );
}

const saveButton = () => screen.getByRole('button', { name: /Salvar/ });
const nameField = () => screen.queryByPlaceholderText(NOTE_NAME) as HTMLInputElement | null;

describe('AutomationsManager — o editor só fecha após a confirmação da persistência (R2-MOD-003 / #386)', () => {
  beforeEach(() => {
    hoisted.rows = [];
    hoisted.next = null;
    mockToast.error.mockReset();
    mockToast.success.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('criação: a Promise pendente mantém o diálogo aberto e ele fecha só depois de resolver', async () => {
    const deferred = hoisted.make();
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /Nova/ }));
    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Automação nova' } });
    fireEvent.click(saveButton());

    // Deixa qualquer callback já resolvido rodar: com o defeito (mutate fire-and-forget)
    // o diálogo já teria fechado aqui — sem o banco ter confirmado nada.
    await flush();
    expect(nameField()).not.toBeNull();
    expect(saveButton()).toBeDisabled();

    deferred.resolve({ data: { id: 'nova-1' }, error: null });

    await waitFor(() => expect(nameField()).toBeNull());
  });

  it('edição: a Promise pendente mantém o diálogo aberto e ele fecha só depois de resolver', async () => {
    hoisted.rows = [buildRow()];
    const deferred = hoisted.make();
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar automação' }));
    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Boas-vindas v2' } });
    fireEvent.click(saveButton());

    await flush();
    expect(nameField()).not.toBeNull();
    expect(saveButton()).toBeDisabled();

    deferred.resolve({ data: null, error: null });

    await waitFor(() => expect(nameField()).toBeNull());
  });

  it('rejeição: o diálogo continua aberto e preserva os campos digitados para retry', async () => {
    const deferred = hoisted.make();
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /Nova/ }));
    fireEvent.change(screen.getByPlaceholderText(NOTE_NAME), { target: { value: 'Automação que falha' } });
    fireEvent.click(saveButton());

    deferred.resolve({ data: null, error: new Error('falha de persistência') });

    await flush();
    await flush();
    expect(nameField()).not.toBeNull();
    expect(nameField()!.value).toBe('Automação que falha');
  });
});

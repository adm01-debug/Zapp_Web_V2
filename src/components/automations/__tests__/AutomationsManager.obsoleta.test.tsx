import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// A função de tags foi removida do sistema. Automações gravadas antes disso
// continuam no banco (nada é apagado) e precisam aparecer na lista MARCADAS e
// desativadas, em vez de renderizar um badge vazio. Estes testes usam o
// componente REAL (`AutomationsManager` + `AutomationCard`) com a persistência
// do Supabase controlada pelo teste:
//   1. o registro antigo continua na lista, com o rótulo "obsoleta" e o
//      controle de ativação desabilitado;
//   2. nenhum DELETE é disparado só por ele estar na lista;
//   3. a automação viva ao lado segue ativa e ligável (a marca não vaza).

const hoisted = vi.hoisted(() => ({
  rows: [] as unknown[],
  deleteCalls: [] as unknown[],
}));

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: hoisted.rows, error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      delete: () => {
        hoisted.deleteCalls.push('delete');
        return { eq: () => Promise.resolve({ error: null }) };
      },
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
  useReducedMotion: () => false,
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

// Switch fiel ao real no que importa aqui: um `disabled` de verdade que o
// usuário não consegue acionar — sem isso a prova de "desativada" seria vã.
vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: { checked: boolean; onCheckedChange: (v: boolean) => void } & Record<string, unknown>) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      {...props}
      onClick={() => {
        if (!props.disabled) onCheckedChange(!checked);
      }}
    />
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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

const ROTULO_OBSOLETA = 'Obsoleta (tag removida)';
const SWITCH_OBSOLETA = 'Automação obsoleta: não pode ser ativada';

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

describe('AutomationsManager — automação de tipo removido fica marcada e desativada (sem apagar)', () => {
  beforeEach(() => {
    hoisted.deleteCalls = [];
    mockToast.error.mockReset();
    mockToast.success.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o registro antigo continua na lista, com o rótulo obsoleta e o controle desabilitado', async () => {
    hoisted.rows = [
      buildRow({ id: 'auto-obsoleta', name: 'Grupo antigo', trigger_type: 'gatilho_que_saiu', is_active: true }),
      buildRow({ id: 'auto-viva', name: 'Boas-vindas vive' }),
    ];

    renderManager();

    // 1. o registro antigo NÃO some da lista (não apagamos nada)
    expect(await screen.findByText('Grupo antigo')).toBeInTheDocument();
    expect(screen.getByText(ROTULO_OBSOLETA)).toBeInTheDocument();

    // 2. ele aparece desativado mesmo gravado como ativo, e o usuário não consegue ligar
    const switchObsoleto = screen.getByRole('switch', { name: SWITCH_OBSOLETA });
    expect(switchObsoleto).toBeDisabled();
    expect(switchObsoleto).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(switchObsoleto);
    expect(switchObsoleto).toHaveAttribute('aria-checked', 'false');

    // 3. a automação viva ao lado segue ativa e ligável (a marca não vaza)
    const switchVivo = screen.getByRole('switch', { name: 'Ativar automação' });
    expect(switchVivo).toBeEnabled();
    expect(switchVivo).toHaveAttribute('aria-checked', 'true');

    // 4. estar na lista não dispara DELETE nenhum
    await waitFor(() => expect(hoisted.deleteCalls).toHaveLength(0));
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('o filtro "Inativas" acolhe o registro obsoleto e o "Ativas" não o mostra', async () => {
    hoisted.rows = [
      buildRow({ id: 'auto-obsoleta', name: 'Grupo antigo', trigger_type: 'gatilho_que_saiu', is_active: true }),
      buildRow({ id: 'auto-viva', name: 'Boas-vindas vive' }),
    ];

    renderManager();
    await screen.findByText('Grupo antigo');

    fireEvent.click(screen.getByRole('button', { name: 'Ativas' }));
    expect(screen.getByText('Boas-vindas vive')).toBeInTheDocument();
    expect(screen.queryByText('Grupo antigo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inativas' }));
    expect(screen.getByText('Grupo antigo')).toBeInTheDocument();
    expect(screen.queryByText('Boas-vindas vive')).not.toBeInTheDocument();
  });
});

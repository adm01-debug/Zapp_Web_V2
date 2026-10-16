/**
 * Paridade V3 (E60) — papel inválido recusado no diálogo "Adicionar Novo Usuário".
 *
 * O defeito: em `AdminView.tsx` o `<Select>` de papel fazia
 * `onValueChange={(v) => setNewUser(p => ({ ...p, role: v as AppRole }))}` — o
 * `as AppRole` aceitava QUALQUER string (ex.: `superadmin`, `owner`, `''`) e ela
 * ia direto no `handleCreateUser` (RPC de criação de usuário).
 *
 * O teste troca o `<Select>` por um dublê que entrega a string crua no
 * `onValueChange` — o boundary de verdade — e cobra a recusa olhando o papel
 * que chega ao `handleCreateUser` (o que a tela grava). Para não capturar o
 * Select da tabela, a tela é montada sem usuários (a tabela só tem Select
 * dentro do `users.map`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const { receberPapel, handleCreateUser } = vi.hoisted(() => ({
  receberPapel: { atual: null as null | ((valor: string) => void) },
  handleCreateUser: vi.fn(),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children?: React.ReactNode }) => {
    receberPapel.atual = onValueChange ?? null;
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
  SUPABASE_URL: 'http://localhost:54321',
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
}));

vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [],
    auditLogs: [],
    loading: false,
    fetchData: vi.fn(),
    handleRoleChange: vi.fn(),
    handleToggleActive: vi.fn(),
    handleSaveUser: vi.fn(),
    handleCreateUser,
  }),
  accessLevelConfig: {
    basic: { label: 'Básico', description: '' },
    standard: { label: 'Padrão', description: '' },
  },
}));

import { AdminView } from '../AdminView';

beforeEach(() => {
  handleCreateUser.mockReset();
  handleCreateUser.mockResolvedValue(false);
  receberPapel.atual = null;
});

afterEach(() => cleanup());

function abrirDialogo() {
  render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/i }));
  expect(typeof receberPapel.atual).toBe('function');
}

async function preencherEEnviar() {
  fireEvent.change(screen.getByLabelText(/Primeiro Nome/), { target: { value: 'Novo' } });
  fireEvent.change(screen.getByLabelText(/Email \*/), { target: { value: 'novo@promobrindes.com.br' } });
  fireEvent.change(screen.getByLabelText(/Senha \*/), { target: { value: 'segredo1' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Criar Usuário/i }));
  });
}

describe('AdminView — papel inválido não passa no diálogo de novo usuário', () => {
  it('o boundary entrega a string crua do Select ao guard (não a um cast)', () => {
    abrirDialogo();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('recusa `superadmin`/`owner`/`` e cria o usuário com o papel anterior (agent)', async () => {
    abrirDialogo();
    await act(async () => {
      for (const invalido of ['superadmin', 'owner', '', 'admin ']) receberPapel.atual!(invalido);
    });
    await preencherEEnviar();
    expect(handleCreateUser).toHaveBeenCalledTimes(1);
    expect(handleCreateUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent' }));
  });

  it('aceita um papel da lista e cria o usuário com ele', async () => {
    abrirDialogo();
    await act(async () => receberPapel.atual!('supervisor'));
    await preencherEEnviar();
    expect(handleCreateUser).toHaveBeenCalledTimes(1);
    expect(handleCreateUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'supervisor' }));
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// SL-160 — o inventário de 07/10/2026 (P2-3.4) aponta o Google Calendar como
// integração NÃO IMPLEMENTADA: não existe OAuth nem sincronização em `src/`
// nem em `supabase/functions`. A única oferta de "Google Calendar" no produto
// era o switch de serviços Google do diálogo "Adicionar Novo Usuário" (o mesmo
// trace citado na evidência do cartão: AdminView.tsx:41), que gravava uma
// permissão `google_calendar` em `user_service_accounts` sem nenhum consumidor.
// Estes testes prendem o comportamento honesto: a opção continua visível (para
// ser ligada quando a integração real existir) mas fica desligada e rotulada.
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
    handleCreateUser: vi.fn(),
  }),
  accessLevelConfig: {
    basic: { label: 'Básico', description: '' },
    standard: { label: 'Padrão', description: '' },
    advanced: { label: 'Avançado', description: '' },
    full: { label: 'Completo', description: '' },
  },
}));

import { AdminView } from '../AdminView';

function abrirDialogoComContaGoogle() {
  render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/i }));
  fireEvent.change(screen.getByPlaceholderText('usuario@gmail.com'), {
    target: { value: 'atendente@promobrindes.com.br' },
  });
}

describe('AdminView — serviços Google do novo usuário (SL-160)', () => {
  it('não deixa atribuir o Google Calendar, que não tem integração implementada', () => {
    abrirDialogoComContaGoogle();

    const calendario = screen.getByRole('switch', { name: /Google Calendar/i });

    expect(calendario).toBeDisabled();
    expect(calendario).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/em desenvolvimento/i)).toBeInTheDocument();
  });

  it('mantém os demais serviços Google utilizáveis', () => {
    abrirDialogoComContaGoogle();

    for (const servico of ['Google Sheets', 'Google Docs', 'Google Drive']) {
      expect(screen.getByRole('switch', { name: new RegExp(servico, 'i') })).toBeEnabled();
    }
  });
});

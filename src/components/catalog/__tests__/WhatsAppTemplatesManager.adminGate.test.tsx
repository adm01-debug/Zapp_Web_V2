/**
 * Gate de escrita do gerenciador de modelos de WhatsApp.
 *
 * ── O que este teste prova ────────────────────────────────────────
 * A rota `wa-templates` é liberada para STAFF (admin + supervisor,
 * `src/services/navigation.service.ts`), mas as políticas de escrita de
 * `whatsapp_templates` usam `is_admin_or_supervisor` (`20260315123034`,
 * `20260317222534`): admin e supervisor escrevem; agente não.
 *
 * Aqui se prova, pelo DOM do componente REAL:
 *   (a) admin: vê Novo Template e as 3 ações de escrita de cada linha;
 *   (b) não-admin: NÃO vê nenhum controle que a RLS negaria, mas continua
 *       vendo a lista e o botão Visualizar (leitura é permitida ao staff);
 *   (c) estado vazio: "Criar primeiro template" só existe para admin.
 *
 * ── Falha sem a correção ─────────────────────────────────────────
 * Sem o gate, o caso (b) encontra "Novo Template" e os botões de escrita na
 * tela de um supervisor — exatamente os cliques que a RLS recusa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppTemplatesManager } from '../WhatsAppTemplatesManager';
import './catalogMocks';

const template = vi.hoisted(() => ({
  id: 'tpl-1',
  name: 'confirmacao_pedido',
  category: 'utility',
  language: 'pt_BR',
  content: 'Olá {{1}}, seu pedido {{2}} foi confirmado!',
  header_text: null,
  footer_text: null,
  buttons: [],
  variables: ['{{1}}', '{{2}}'],
  status: 'approved',
  whatsapp_connection_id: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));

// `isSupervisor` inclui admin (useUserRole); agente => false.
const role = vi.hoisted(() => ({ isAdmin: true, isSupervisor: true }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: role.isAdmin, isSupervisor: role.isSupervisor, loading: false }),
}));

const mockTemplates = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useWhatsAppTemplates', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useWhatsAppTemplates')>(
    '@/hooks/integrations/useWhatsAppTemplates',
  );
  return { ...actual, useWhatsAppTemplates: () => mockTemplates() };
});

const baseReturn = (templates: unknown[]) => ({
  templates,
  loading: false,
  search: '',
  setSearch: vi.fn(),
  filterCategory: 'all',
  setFilterCategory: vi.fn(),
  filterStatus: 'all',
  setFilterStatus: vi.fn(),
  isDialogOpen: false,
  setIsDialogOpen: vi.fn(),
  isPreviewOpen: false,
  setIsPreviewOpen: vi.fn(),
  editingTemplate: {},
  setEditingTemplate: vi.fn(),
  previewTemplate: null,
  previewVariables: {},
  setPreviewVariables: vi.fn(),
  isSaving: false,
  handleContentChange: vi.fn(),
  handleSave: vi.fn(),
  handleDelete: vi.fn(),
  handleDuplicate: vi.fn(),
  handlePreview: vi.fn(),
  renderPreviewContent: () => null,
  openNew: vi.fn(),
  openEdit: vi.fn(),
});

const renderManager = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WhatsAppTemplatesManager />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  role.isAdmin = true;
  role.isSupervisor = true;
  mockTemplates.mockReturnValue(baseReturn([template]));
});

describe('gate de escrita de modelos de WhatsApp (RLS admin + supervisor)', () => {
  it('admin vê Novo Template e as ações de escrita da linha', () => {
    renderManager();

    expect(screen.getByRole('button', { name: /Novo Template/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visualizar confirmacao_pedido' })).toBeInTheDocument();
  });

  it('supervisor (não admin) também vê os controles de escrita, como a RLS permite', () => {
    role.isAdmin = false;
    role.isSupervisor = true;
    renderManager();

    expect(screen.getByRole('button', { name: /Novo Template/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir confirmacao_pedido' })).toBeInTheDocument();
    expect(screen.queryByText(/Somente administradores/)).not.toBeInTheDocument();
  });

  it('agente não vê nenhum controle de escrita, mas vê a lista e o Visualizar', () => {
    role.isAdmin = false;
    role.isSupervisor = false;
    renderManager();

    expect(screen.queryByRole('button', { name: /Novo Template/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar confirmacao_pedido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar confirmacao_pedido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir confirmacao_pedido' })).not.toBeInTheDocument();

    // a leitura continua liberada para o staff
    expect(screen.getByText('confirmacao_pedido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visualizar confirmacao_pedido' })).toBeInTheDocument();
    // e o motivo fica explicado
    expect(screen.getByText(/Somente administradores/)).toBeInTheDocument();
  });

  it('estado vazio: "Criar primeiro template" só para admin', () => {
    mockTemplates.mockReturnValue(baseReturn([]));

    const { unmount } = renderManager();
    expect(screen.getByRole('button', { name: /Criar primeiro template/ })).toBeInTheDocument();
    unmount();

    role.isAdmin = false;
    role.isSupervisor = false;
    renderManager();
    expect(screen.getByText('Nenhum template encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar primeiro template/ })).not.toBeInTheDocument();
  });
});

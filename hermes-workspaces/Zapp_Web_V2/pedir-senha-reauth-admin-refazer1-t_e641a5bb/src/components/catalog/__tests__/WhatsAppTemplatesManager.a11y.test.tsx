/**
 * N-060 — nomes acessíveis nos botões e seletores do gerenciador de
 * modelos WhatsApp (aria-label nos 4 botões de ação e nos 5
 * SelectTrigger).
 *
 * ── O que este teste prova ────────────────────────────────────────
 * (a) Os 4 botões de ação (visualizar, editar, duplicar, excluir)
 *     carregam `aria-label` que inclui o `name` do template.
 * (b) Os 5 SelectTrigger (filtros de categoria e status + diálogo de
 *     categoria, idioma e status) carregam `aria-label` descritivo.
 * (c) axe-core zero violações no componente.
 *
 * ── Falha sem a correção ─────────────────────────────────────────
 * Remover os `aria-label` dos botões e seletores faz o teste falhar
 * (violações `button-name` e `aria-input-field-name` do axe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppTemplatesManager } from '../WhatsAppTemplatesManager';
import './catalogMocks';

const mockTemplate = vi.hoisted(() => ({
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

const mockUseWhatsAppTemplates = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useWhatsAppTemplates', () => ({
  useWhatsAppTemplates: () => mockUseWhatsAppTemplates(),
  TEMPLATE_CATEGORIES: [
    { value: 'marketing', label: 'Marketing' },
    { value: 'utility', label: 'Utilidade' },
    { value: 'authentication', label: 'Autenticação' },
  ],
  TEMPLATE_LANGUAGES: [
    { value: 'pt_BR', label: 'Português (BR)' },
    { value: 'en_US', label: 'English (US)' },
    { value: 'es', label: 'Español' },
  ],
  STATUS_BADGES: {
    draft: { label: 'Rascunho', className: '', iconName: 'FileText' },
    pending: { label: 'Pendente', className: '', iconName: 'Clock' },
    approved: { label: 'Aprovado', className: '', iconName: 'CheckCircle2' },
    rejected: { label: 'Rejeitado', className: '', iconName: 'XCircle' },
  },
  EMPTY_TEMPLATE: {},
}));

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const baseMock = vi.hoisted(() => ({
  templates: [mockTemplate],
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
  editingTemplate: { ...mockTemplate },
  setEditingTemplate: vi.fn(),
  previewTemplate: null,
  previewVariables: [],
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
}));

const renderManager = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WhatsAppTemplatesManager />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  mockUseWhatsAppTemplates.mockReturnValue({ ...baseMock });
});

describe('N-060 — nomes acessíveis em botões e seletores', () => {
  it('4 botões de ação têm aria-label com o nome do modelo', () => {
    renderManager();
    expect(screen.getByRole('button', { name: /Visualizar confirmacao_pedido/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar confirmacao_pedido/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duplicar confirmacao_pedido/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir confirmacao_pedido/i })).toBeInTheDocument();
  });

  it('2 seletores de filtro têm aria-label descritivo', () => {
    renderManager();
    expect(screen.getByLabelText('Filtrar por categoria')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por status')).toBeInTheDocument();
  });

  it('3 seletores do diálogo têm aria-label descritivo', () => {
    mockUseWhatsAppTemplates.mockReturnValue({ ...baseMock, isDialogOpen: true });
    renderManager();
    expect(screen.getByLabelText('Categoria do template')).toBeInTheDocument();
    expect(screen.getByLabelText('Idioma do template')).toBeInTheDocument();
    expect(screen.getByLabelText('Status do template')).toBeInTheDocument();
  });

  it('axe-core zero violações', async () => {
    const { container } = renderManager();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
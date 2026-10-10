import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Exclusão de template WhatsApp com confirmação: a lixeira abre o AlertDialog e
 * `handleDelete` só roda no botão "Excluir". "Cancelar" fecha sem apagar.
 * O componente é o REAL (nenhum mock do diálogo).
 */

const mocks = vi.hoisted(() => ({ handleDelete: vi.fn() }));

vi.mock('@/hooks/integrations/useWhatsAppTemplates', () => ({
  TEMPLATE_CATEGORIES: [{ value: 'marketing', label: 'Marketing', color: '' }],
  TEMPLATE_LANGUAGES: [{ value: 'pt_BR', label: 'Português (BR)' }],
  STATUS_BADGES: {
    draft: { label: 'Rascunho', className: '', iconName: 'FileText' },
    approved: { label: 'Aprovado', className: '', iconName: 'CheckCircle2' },
  },
  EMPTY_TEMPLATE: {},
  useWhatsAppTemplates: () => ({
    templates: [
      {
        id: 'tpl-1',
        name: 'Promoção',
        content: 'Olá {{1}}',
        category: 'marketing',
        language: 'pt_BR',
        status: 'draft',
        variables: ['1'],
      },
    ],
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
    editingTemplate: { id: '', name: '', content: '', category: 'marketing', language: 'pt_BR', status: 'draft', variables: [] },
    setEditingTemplate: vi.fn(),
    previewTemplate: null,
    previewVariables: {},
    setPreviewVariables: vi.fn(),
    isSaving: false,
    handleContentChange: vi.fn(),
    handleSave: vi.fn(),
    handleDelete: mocks.handleDelete,
    handleDuplicate: vi.fn(),
    handlePreview: vi.fn(),
    renderPreviewContent: (v: string) => v,
    openNew: vi.fn(),
    openEdit: vi.fn(),
  }),
}));

import { WhatsAppTemplatesManager } from '../WhatsAppTemplatesManager';

beforeEach(() => vi.clearAllMocks());

describe('WhatsAppTemplatesManager — exclusão com confirmação', () => {
  it('a lixeira abre a confirmação e NÃO apaga antes de confirmar; cancelar mantém o template', () => {
    render(<WhatsAppTemplatesManager />);

    fireEvent.click(screen.getByLabelText(/Excluir Promoção/));

    expect(mocks.handleDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir template?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.handleDelete).not.toHaveBeenCalled();
  });

  it('confirmar exclui o template certo', () => {
    render(<WhatsAppTemplatesManager />);

    fireEvent.click(screen.getByLabelText(/Excluir Promoção/));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(mocks.handleDelete).toHaveBeenCalledWith('tpl-1');
  });
});

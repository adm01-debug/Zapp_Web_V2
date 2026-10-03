import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesListView } from '../FilesListView';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

const IMAGE: ContactMediaItem = {
  id: 'm1', url: 'https://x/planilha.png', type: 'image', filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png', extension: 'png', senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z', caption: null, mimetype: 'image/png',
  size: 1200000, meta: null, sender: 'agent', signedUrl: 'https://signed.test/planilha.png',
};

const DOC: ContactMediaItem = {
  ...IMAGE, id: 'm2', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', size: null, sender: 'contact', senderLabel: null,
};

function renderList(overrides: Partial<React.ComponentProps<typeof FilesListView>> = {}) {
  const props: React.ComponentProps<typeof FilesListView> = {
    items: [IMAGE, DOC],
    contactName: 'Ana Cliente',
    selectionMode: false,
    selectedIds: new Set<string>(),
    containerWidth: 900,
    onSelect: vi.fn(),
    onToggleSelection: vi.fn(),
    onPreview: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  return { ...render(<FilesListView {...props} />), props };
}

describe('FilesListView (etapas 21-22)', () => {
  it('etapa 21: linha h-16 com files-item-<id>, nome truncável com title e meta com remetente', () => {
    renderList();
    const row = screen.getByTestId('files-item-m1');
    expect(row.className).toContain('h-16');
    expect(row.className).toContain('rounded-xl');

    const nome = screen.getByRole('button', { name: 'planilha-total.png' });
    expect(nome).toHaveAttribute('title', 'IMG-20260924-WA0031.jpg');
    expect(nome.className).toContain('truncate');

    expect(screen.getByText(/Imagem · 1\.1 MB · .* · Atendente/)).toBeInTheDocument();
    expect(screen.getByText(/Documento · .* · Ana Cliente/)).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'Visualizar' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Encaminhar' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Mais ações' })).toHaveLength(2);
  });

  it('etapa 22: com 600 px de contêiner o remetente some e sobram Visualizar + Mais ações', () => {
    renderList({ containerWidth: 600 });
    expect(screen.queryByText(/Atendente/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ana Cliente/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encaminhar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Visualizar' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Mais ações' })).toHaveLength(2);
    // a meta continua (na segunda linha), agora sem o remetente
    expect(screen.getByText(/^Imagem · 1\.1 MB · /)).toBeInTheDocument();
  });

  it('etapa 21: no modo seleção o checkbox fica à esquerda e alterna sem abrir prévia', () => {
    const { props } = renderList({ selectionMode: true, selectedIds: new Set(['m1']) });
    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar planilha-total.png' });
    fireEvent.click(checkbox);
    expect(props.onToggleSelection).toHaveBeenCalledWith('m1');
    expect(props.onPreview).not.toHaveBeenCalled();
  });

  it('etapa 22: linha com size nulo alinha igual às vizinhas', () => {
    renderList({ items: [DOC] });
    const row = screen.getByTestId('files-item-m2');
    expect(row.className).toContain('h-16');
    expect(screen.queryByText(/\d+ (KB|MB|B)/)).not.toBeInTheDocument();
  });
});

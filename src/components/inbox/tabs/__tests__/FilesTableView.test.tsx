import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesTableView } from '../FilesTableView';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort } from '@/hooks/chat/useFilesViewState';

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

function renderTable(overrides: Partial<React.ComponentProps<typeof FilesTableView>> = {}) {
  const props: React.ComponentProps<typeof FilesTableView> = {
    items: [IMAGE, DOC],
    contactName: 'Ana Cliente',
    selectionMode: false,
    selectedIds: new Set<string>(),
    containerWidth: 900,
    sort: 'recent' as FilesSort,
    onSortChange: vi.fn(),
    onSelect: vi.fn(),
    onToggleSelection: vi.fn(),
    onPreview: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<FilesTableView {...props} />), props };
}

describe('FilesTableView (etapas 23-24)', () => {
  it('etapa 23: só Arquivo, Tamanho e Data têm botão de ordenação', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: /Arquivo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arquivo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tamanho/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Data/ })).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: /Tipo/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Remetente/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remetente/ })).not.toBeInTheDocument();
  });

  it('etapa 23: Data mapeia o mesmo sort do hook (recent=desc, old=asc) com aria-sort', () => {
    const { props, unmount } = renderTable({ sort: 'recent' });
    expect(screen.getByRole('columnheader', { name: /Data/ })).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByRole('button', { name: /Data/ }));
    expect(props.onSortChange).toHaveBeenLastCalledWith('old');
    unmount();

    renderTable({ sort: 'old' });
    expect(screen.getByRole('columnheader', { name: /Data/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('etapa 23: Arquivo → alpha e Tamanho → biggest; colunas inativas com aria-sort none', () => {
    const { props } = renderTable({ sort: 'biggest' });
    expect(screen.getByRole('columnheader', { name: /Tamanho/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /Data/ })).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByRole('button', { name: /Arquivo/ }));
    expect(props.onSortChange).toHaveBeenLastCalledWith('alpha');
  });

  it('etapa 24: < 720 px esconde Remetente e Tamanho; < 560 px esconde Tipo', () => {
    const { unmount } = renderTable({ containerWidth: 683 });
    expect(screen.queryByRole('columnheader', { name: /Remetente/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Tamanho/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tipo/ })).toBeInTheDocument();
    unmount();

    renderTable({ containerWidth: 520 });
    expect(screen.queryByRole('columnheader', { name: /Tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Remetente/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Arquivo/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Data/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Ações/ })).toBeInTheDocument();
  });

  it('etapa 24: a tabela é table-fixed e o overflow vive dentro dela', () => {
    const { container } = renderTable();
    expect(container.querySelector('table')?.className).toContain('table-fixed');
    // a Table do ui embrulha a <table> num contêiner com overflow — nada de overflow no painel
    expect(container.querySelector('table')?.parentElement?.className).toContain('overflow');
  });

  it('etapa 23: cada linha expõe files-item-<id>', () => {
    const { container } = renderTable();
    const ids = Array.from(container.querySelectorAll('[data-testid^="files-item-"]'))
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['files-item-m1', 'files-item-m2']);
  });
});

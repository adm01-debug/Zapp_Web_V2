import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FilesTableView } from '../FilesTableView';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort } from '@/hooks/chat/useFilesViewState';
import type { SenderProfileMap } from '@/lib/fileSenderIdentity';

const FOTO = 'https://cdn.test/zelia.png';

const IMAGE: ContactMediaItem = {
  id: 'm1', url: 'https://x/planilha.png', type: 'image', filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png', extension: 'png', senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z', caption: null, mimetype: 'image/png',
  size: 1200000, meta: null, sender: 'agent', signedUrl: 'https://signed.test/planilha.png',
  agentId: 'p-2',
};

const DOC: ContactMediaItem = {
  ...IMAGE, id: 'm2', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', size: null, sender: 'contact', senderLabel: null, agentId: null,
};

const PERFIL: SenderProfileMap = { 'p-2': { id: 'p-2', name: 'Zélia Souza', avatar_url: FOTO } };

/** Ordem em que a tabela desenhou as linhas (data-testid `files-item-<id>`). */
function rowOrder(): (string | null)[] {
  return screen.getAllByTestId(/^files-item-/).map((el) => el.getAttribute('data-testid'));
}

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
  it('etapa 23: Arquivo, Tamanho, Data e Enviado por têm botão de ordenação', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: /Arquivo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arquivo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tamanho/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Data/ })).toBeInTheDocument();
    // R06 (S48): a coluna do remetente também ordena.
    expect(screen.getByRole('button', { name: /Enviado por/ })).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: /Tipo/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Enviado por/ })).toBeInTheDocument();
    // o cabeçalho antigo não existe mais: a coluna foi renomeada, não duplicada.
    expect(screen.queryByRole('columnheader', { name: /^Remetente$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tipo/ })).not.toBeInTheDocument();
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

  it('etapa 24: < 720 px esconde o remetente e Tamanho; < 560 px esconde Tipo', () => {
    const { unmount } = renderTable({ containerWidth: 683 });
    expect(screen.queryByRole('columnheader', { name: /Enviado por/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Tamanho/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tipo/ })).toBeInTheDocument();
    unmount();

    renderTable({ containerWidth: 520 });
    expect(screen.queryByRole('columnheader', { name: /Tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Enviado por/ })).not.toBeInTheDocument();
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

/**
 * R06 (S48) — a coluna "Enviado por" mostra foto + nome de quem enviou (lote de perfis
 * repassado por props, D04) e ordena pela pessoa.
 */
describe('FilesTableView — Enviado por (R06, S48)', () => {
  it('S48: a célula mostra a foto e o nome do atendente do lote de perfis', () => {
    renderTable({ senderProfiles: PERFIL, currentUserId: 'outro' });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Zélia Souza');
    expect(linha.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S48/D01: "Você" para o usuário logado e o nome do contato quando o contato enviou', () => {
    renderTable({ senderProfiles: PERFIL, currentUserId: 'p-2' });

    expect(within(screen.getByTestId('files-item-m1')).getByTestId('sender-avatar-name'))
      .toHaveTextContent('Você');
    expect(within(screen.getByTestId('files-item-m2')).getByTestId('sender-avatar-name'))
      .toHaveTextContent('Ana Cliente');
  });

  it('S48/D01: atendente sem agent_id vira "Equipe", sem foto', () => {
    renderTable({ items: [{ ...IMAGE, agentId: null }], senderProfiles: {} });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Equipe');
    expect(linha.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
  });

  it('S48: ordenável — clicar em "Enviado por" ordena pelo nome (A→Z) e alterna (Z→A)', () => {
    renderTable({ senderProfiles: PERFIL });
    // sem clique, a tabela mantém a ordem que o pai mandou (sort do hook)
    expect(rowOrder()).toEqual(['files-item-m1', 'files-item-m2']);

    fireEvent.click(screen.getByRole('button', { name: /Enviado por/ }));
    // Ana Cliente (contato) antes de Zélia Souza (atendente)
    expect(rowOrder()).toEqual(['files-item-m2', 'files-item-m1']);
    expect(screen.getByRole('columnheader', { name: /Enviado por/ })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByRole('button', { name: /Enviado por/ }));
    expect(rowOrder()).toEqual(['files-item-m1', 'files-item-m2']);
    expect(screen.getByRole('columnheader', { name: /Enviado por/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('S48: enquanto o remetente ordena, as colunas do hook ficam com aria-sort none', () => {
    renderTable({ senderProfiles: PERFIL, sort: 'recent' });
    expect(screen.getByRole('columnheader', { name: /Data/ })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: /Enviado por/ }));
    expect(screen.getByRole('columnheader', { name: /Data/ })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: /Arquivo/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('S48: pedir outra ordem à barra de ferramentas (pai muda o sort) volta à ordem do hook', () => {
    const { props, rerender } = renderTable({ senderProfiles: PERFIL });
    fireEvent.click(screen.getByRole('button', { name: /Enviado por/ }));
    expect(rowOrder()).toEqual(['files-item-m2', 'files-item-m1']);

    rerender(<FilesTableView {...props} sort="biggest" />);
    expect(rowOrder()).toEqual(['files-item-m1', 'files-item-m2']);
    expect(screen.getByRole('columnheader', { name: /Enviado por/ })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: /Tamanho/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('S48: com a coluna escondida pela largura (< 720 px) a ordem do hook volta', () => {
    const { props, rerender } = renderTable({ senderProfiles: PERFIL });
    fireEvent.click(screen.getByRole('button', { name: /Enviado por/ }));
    expect(rowOrder()).toEqual(['files-item-m2', 'files-item-m1']);

    rerender(<FilesTableView {...props} containerWidth={683} />);
    expect(screen.queryByRole('columnheader', { name: /Enviado por/ })).not.toBeInTheDocument();
    expect(rowOrder()).toEqual(['files-item-m1', 'files-item-m2']);
  });
});

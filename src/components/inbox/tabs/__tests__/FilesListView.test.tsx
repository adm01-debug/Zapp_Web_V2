import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FilesListView } from '../FilesListView';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { SenderProfileMap } from '@/lib/fileSenderIdentity';

const FOTO = 'https://cdn.test/ana.png';

const IMAGE: ContactMediaItem = {
  id: 'm1', url: 'https://x/planilha.png', type: 'image', filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png', extension: 'png', senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z', caption: null, mimetype: 'image/png',
  size: 1200000, meta: null, sender: 'agent', signedUrl: 'https://signed.test/planilha.png',
  agentId: 'p-1',
};

const DOC: ContactMediaItem = {
  ...IMAGE, id: 'm2', type: 'document', filename: 'contrato.pdf', displayName: 'contrato.pdf',
  extension: 'pdf', size: null, sender: 'contact', senderLabel: null, agentId: null,
};

const PERFIL: SenderProfileMap = { 'p-1': { id: 'p-1', name: 'Ana Atendente', avatar_url: FOTO } };

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
    onRequestDelete: vi.fn(),
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

    // etapa 25: a meta (tipo · tamanho · data) vem do `formatMeta`, sem o remetente.
    expect(within(row).getByText(/^Imagem · 1\.1 MB · /)).toBeInTheDocument();
    expect(within(screen.getByTestId('files-item-m2')).getByText(/^Documento · /)).toBeInTheDocument();

    // R06: o remetente da linha é foto + nome (o rótulo do atendente continua o do cartão).
    expect(within(row).getByTestId('sender-avatar-name')).toHaveTextContent('Atendente');
    expect(within(screen.getByTestId('files-item-m2')).getByTestId('sender-avatar-name'))
      .toHaveTextContent('Ana Cliente');

    expect(screen.getAllByRole('button', { name: 'Visualizar' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Encaminhar' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Mais ações' })).toHaveLength(2);
  });

  it('etapa 22: com 600 px de contêiner o remetente some e sobram Visualizar + Mais ações', () => {
    renderList({ containerWidth: 600 });
    expect(screen.queryByText(/Atendente/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ana Cliente/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('sender-avatar')).not.toBeInTheDocument();
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

/**
 * R06 (S47) — a Lista mostra QUEM ENVIOU com a foto e o nome, do lote de perfis que o
 * `FilesTab` repassa por props (D04): a linha não consulta o banco por conta própria.
 */
describe('FilesListView — quem enviou (R06, S47)', () => {
  it('S47: a linha mostra a foto e o nome do atendente do lote de perfis', () => {
    renderList({ senderProfiles: PERFIL, currentUserId: 'outro' });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Atendente');
    expect(linha.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
    expect(linha.getByTestId('sender-avatar')).toHaveAttribute('aria-label', 'Enviado por Ana Atendente');
  });

  it('S47/D01: o arquivo do próprio usuário logado vira "Você" com a foto dele', () => {
    renderList({ senderProfiles: PERFIL, currentUserId: 'p-1' });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Você');
    expect(linha.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S47/D01: atendente sem agent_id (celular/automação) vira "Equipe", sem foto', () => {
    renderList({ items: [{ ...IMAGE, agentId: null }], senderProfiles: {} });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Equipe');
    expect(linha.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
  });

  it('S47/D01: sem perfil no lote o atendente cai no rótulo "Atendente", sem quebrar a linha', () => {
    renderList({ senderProfiles: {} });

    const linha = within(screen.getByTestId('files-item-m1'));
    expect(linha.getByTestId('sender-avatar-name')).toHaveTextContent('Atendente');
    expect(linha.getByTestId('sender-avatar-initials')).toBeInTheDocument();
  });
});

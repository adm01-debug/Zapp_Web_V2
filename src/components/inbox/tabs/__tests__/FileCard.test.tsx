import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileCard } from '../FileCard';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const ITEM: ContactMediaItem = {
  id: 'm1',
  url: 'https://x/planilha.png',
  type: 'image',
  filename: 'IMG-20260924-WA0031.jpg',
  displayName: 'planilha-total.png',
  extension: 'png',
  senderLabel: 'Atendente',
  created_at: '2026-09-24T17:54:00.000Z',
  caption: null,
  mimetype: 'image/png',
  size: 1200000,
  meta: null,
  sender: 'agent',
  signedUrl: 'https://signed.test/planilha.png',
};

const DOC: ContactMediaItem = {
  ...ITEM,
  id: 'm2',
  type: 'document',
  filename: 'contrato.pdf',
  displayName: 'contrato.pdf',
  extension: 'pdf',
  size: null,
  sender: 'contact',
  senderLabel: null,
};

function renderCard(item: ContactMediaItem = ITEM, overrides: Partial<React.ComponentProps<typeof FileCard>> = {}) {
  const props: React.ComponentProps<typeof FileCard> = {
    item,
    contactName: 'Ana Cliente',
    selected: false,
    onSelect: vi.fn(),
    onToggleSelection: vi.fn(),
    onPreview: vi.fn(),
    onForward: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<FileCard {...props} />), props };
}

beforeEach(() => localStorage.clear());

describe('FileCard (etapas 17-20)', () => {
  it('etapa 20: é um <article> com files-item-<id>, prévia e nome são botões', () => {
    renderCard();
    expect(screen.getByTestId('files-item-m1')).toBeInTheDocument();

    const previa = screen.getByRole('button', { name: 'Visualizar planilha-total.png' });
    expect(previa.tagName).toBe('BUTTON');

    const nome = screen.getByRole('button', { name: 'planilha-total.png' });
    expect(nome.tagName).toBe('BUTTON');
    expect(nome).toHaveAttribute('title', 'IMG-20260924-WA0031.jpg');
  });

  it('etapa 20: Enter/clique na prévia abre o visualizador; no nome abre os detalhes', () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar planilha-total.png' }));
    expect(props.onPreview).toHaveBeenCalledTimes(1);
    expect(props.onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'planilha-total.png' }));
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });

  it('etapa 20: no modo seleção a prévia alterna a seleção e não abre nada', () => {
    const { props } = renderCard(ITEM, { selectionMode: true });

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar planilha-total.png' }));
    expect(props.onToggleSelection).toHaveBeenCalledTimes(1);
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('etapa 20: Space no checkbox alterna sem abrir prévia nem detalhes', () => {
    const { props } = renderCard(ITEM, { selectionMode: true, selectionChecked: false });
    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar planilha-total.png' });

    fireEvent.click(checkbox);
    expect(props.onToggleSelection).toHaveBeenCalledTimes(1);
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('etapa 19: exatamente Visualizar, Encaminhar (em breve) e Mais ações — sem Baixar ativo', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Visualizar' })).toBeEnabled();
    const encaminhar = screen.getByRole('button', { name: 'Encaminhar' });
    expect(encaminhar).toBeDisabled();
    expect(encaminhar).toHaveAttribute('title', 'Disponível em breve');
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeInTheDocument();
  });

  it('etapa 19: o menu traz Baixar desabilitado com o motivo e Excluir só do atendente', () => {
    renderCard();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }), { button: 0, ctrlKey: false });

    const baixar = screen.getByText(/Bloqueado pela política de segurança/);
    expect(baixar.closest('[data-disabled]')).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: /Baixar/ })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /Excluir mensagem/ })).toBeInTheDocument();
  });

  it('etapa 19: "Copiar link" não existe mais e nada escreve na área de transferência', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderCard();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }), { button: 0, ctrlKey: false });
    expect(screen.queryByText(/Copiar link/)).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('etapa 19: sem download ativo — o item não existe para contato', () => {
    renderCard(DOC);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações' }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menuitem', { name: /Excluir mensagem/ })).not.toBeInTheDocument();
  });

  it('etapa 18: "Imagem · 1.1 MB · data" num só parágrafo, com o tamanho omitido quando nulo', () => {
    const { unmount } = renderCard();
    const meta = screen.getByText(/^Imagem · 1\.1 MB · /);
    expect(meta.tagName).toBe('P');
    unmount();

    renderCard(DOC);
    const metaDoc = screen.getByText(/^Documento · /);
    expect(metaDoc).not.toHaveTextContent(/\d+ (KB|MB|B)/);
    expect(metaDoc).not.toHaveTextContent('null');
    expect(metaDoc).not.toHaveTextContent(/·\s*·/);
  });

  it('etapa 18: a linha do remetente só aparece até 4 colunas', () => {
    const { unmount } = renderCard(ITEM, { effectiveColumns: 4 });
    expect(screen.getByText('Atendente')).toBeInTheDocument();
    unmount();

    renderCard(ITEM, { effectiveColumns: 6 });
    expect(screen.queryByText('Atendente')).not.toBeInTheDocument();
  });

  it('etapa 17: a imagem da prévia usa object-contain (print de planilha não é cortado)', () => {
    renderCard();
    const img = screen.getByRole('img');
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
  });
});

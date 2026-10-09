import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { FileCard } from '../FileCard';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

const FOTO = 'https://cdn.test/foto.png';

const ITEM: ContactMediaItem = {
  id: 'm1',
  url: 'https://x/planilha.png',
  type: 'image',
  filename: 'planilha-total.png',
  displayName: 'planilha-total.png',
  extension: 'png',
  senderLabel: 'Atendente',
  agentId: 'p-1',
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
  agentId: null,
};

/** Arquivo do WhatsApp: o nome exibido é genérico e o hex técnico só aparece na dica (D09). */
const TECNICO: ContactMediaItem = {
  ...ITEM,
  id: 'm3',
  filename: '3EB0E6947FC0A0ECAED14D_1790283276022.png',
  displayName: 'Imagem · 25/09 09:40',
  extension: 'png',
  sender: 'contact',
  agentId: null,
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('FileCard — layout do mockup (R04, S28–S31)', () => {
  it('S28: a linha 1 é o nome; o nome completo/técnico fica na dica', () => {
    const { unmount } = renderCard();
    const nome = screen.getByRole('button', { name: 'planilha-total.png' });
    expect(nome).toHaveAttribute('title', 'planilha-total.png');
    unmount();

    renderCard(TECNICO);
    const tecnico = screen.getByRole('button', { name: 'Imagem · 25/09 09:40' });
    expect(tecnico).toHaveAttribute('title', '3EB0E6947FC0A0ECAED14D_1790283276022.png');
    // O hex não aparece na tela: só na dica.
    expect(screen.queryByText('3EB0E6947FC0A0ECAED14D_1790283276022.png')).not.toBeInTheDocument();
  });

  it('S29: a linha 2 é só tipo · tamanho, com vírgula no decimal', () => {
    renderCard();
    const meta = screen.getByText('Imagem · 1,1 MB');
    expect(meta.tagName).toBe('P');
  });

  it('S30: a linha 3 é a data curta do cartão', () => {
    renderCard({ ...ITEM, created_at: new Date().toISOString() });
    expect(screen.getByText(/^Hoje, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('S30: data antiga sai por extenso ("02 set 2026, 18:45")', () => {
    renderCard();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('S36: as quatro linhas existem sempre — inclusive sem tamanho (altura uniforme)', () => {
    const { unmount } = renderCard();
    expect(screen.getByRole('button', { name: 'planilha-total.png' })).toBeInTheDocument();
    expect(screen.getByText('Imagem · 1,1 MB')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toBeInTheDocument();
    unmount();

    // Sem tamanho, a linha 2 continua no lugar (só o tipo) — nada some da altura do cartão.
    renderCard(DOC);
    expect(screen.getByRole('button', { name: 'contrato.pdf' })).toBeInTheDocument();
    expect(screen.getByText('Documento')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toBeInTheDocument();
  });
});

describe('FileCard — quem enviou (R04, S31 / D01–D03)', () => {
  it('S31: arquivo do próprio usuário logado vira "Você" com a foto dele', () => {
    renderCard(ITEM, {
      currentUserId: 'p-1',
      senderProfiles: { 'p-1': { id: 'p-1', name: 'Joaquim', avatar_url: FOTO } },
    });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Você');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S31: arquivo de OUTRO atendente mostra o nome e a foto do perfil', () => {
    renderCard(ITEM, {
      currentUserId: 'eu',
      senderProfiles: { 'p-1': { id: 'p-1', name: 'Ana Atendente', avatar_url: FOTO } },
    });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Atendente');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S31: atendente sem agent_id (celular/automação) vira "Equipe", sem foto', () => {
    renderCard({ ...ITEM, agentId: null }, { senderProfiles: {} });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Equipe');
    expect(screen.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
  });

  it('S31: arquivo do contato mostra o nome do contato', () => {
    renderCard(DOC);
    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Cliente');
  });

  it('S31/D03: em 5 colunas fica só a foto, com o nome na dica (aria-label)', () => {
    const { unmount } = renderCard(ITEM, { effectiveColumns: 4 });
    expect(screen.getByTestId('sender-avatar-name')).toBeInTheDocument();
    unmount();

    renderCard(ITEM, { effectiveColumns: 5, senderProfiles: { 'p-1': { name: 'Ana Atendente' } } });
    expect(screen.queryByTestId('sender-avatar-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toHaveAttribute('aria-label', 'Enviado por Ana Atendente');
  });
});

describe('FileCard — ações do cartão (R04, S32 / D06, D07)', () => {
  it('S32: as ações são olho, baixar/cadeado, encaminhar (em breve) e ⋮ — sem Copiar link', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Visualizar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Baixar/ })).toBeInTheDocument();
    // O encaminhamento do cartão segue desabilitado ("em breve"), como nas outras vistas.
    const encaminhar = screen.getByRole('button', { name: 'Encaminhar' });
    expect(encaminhar).toBeDisabled();
    expect(encaminhar).toHaveAttribute('title', 'Disponível em breve');
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeInTheDocument();
    expect(screen.queryByText(/Copiar link/)).not.toBeInTheDocument();
  });

  it('S32: sem permissão o botão é o cadeado com a explicação e não baixa nada', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderCard(ITEM, { downloadAllowed: false });

    const cadeado = screen.getByRole('button', { name: /bloqueado por política de segurança/i });
    expect(cadeado).toHaveAttribute('title', 'Download bloqueado por política de segurança');

    fireEvent.click(cadeado);
    expect(mockToastError).toHaveBeenCalledWith(
      '🔒 Download bloqueado por política de segurança',
      expect.objectContaining({ description: expect.stringMatching(/administrador/i) }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('S32: com permissão baixa pelo caminho existente (fetch + anchor com o nome do arquivo)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchSpy);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const original = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const el = original(tagName, options);
      if (tagName === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    }) as typeof document.createElement);

    renderCard(ITEM, { downloadAllowed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('https://x/planilha.png'));
    await waitFor(() => expect(anchors).toHaveLength(1));
    expect(anchors[0].download).toBe('planilha-total.png');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('S32: em áudio, o play do A01 continua na linha de ações', () => {
    renderCard({ ...ITEM, id: 'a1', type: 'audio' });
    expect(screen.getByRole('button', { name: 'Tocar áudio' })).toBeInTheDocument();
  });

  it('S32/D07: Salvar na galeria não existe em lugar nenhum do cartão', () => {
    renderCard();
    expect(screen.queryByText(/Salvar na galeria/i)).not.toBeInTheDocument();
  });
});

describe('FileCard — seleção e modo Selecionar (R04, S33, S34)', () => {
  it('S33: o cartão marcado expõe o estado selecionado e a borda azul (primary)', () => {
    const { unmount } = renderCard(ITEM, { selected: false });
    expect(screen.getByTestId('files-item-m1')).toHaveAttribute('data-selected', 'false');
    unmount();

    renderCard(ITEM, { selected: true });
    const card = screen.getByTestId('files-item-m1');
    expect(card).toHaveAttribute('data-selected', 'true');
    expect(card.className).toContain('border-primary');
  });

  it('S34: no modo Selecionar o marcador do cartão continua alternando a seleção', () => {
    const { props } = renderCard(ITEM, { selectionMode: true, selectionChecked: true });
    const marcador = screen.getByRole('checkbox', { name: 'Selecionar planilha-total.png' });
    expect(marcador).toBeChecked();
    expect(screen.getByTestId('files-item-m1')).toHaveAttribute('data-selected', 'true');

    fireEvent.click(marcador);
    expect(props.onToggleSelection).toHaveBeenCalledTimes(1);
    expect(props.onPreview).not.toHaveBeenCalled();
  });
});

describe('FileCard — comportamento preservado (etapas 17–20)', () => {
  it('etapa 20: é um <article> com files-item-<id>, prévia e nome são botões', () => {
    renderCard();
    expect(screen.getByTestId('files-item-m1')).toBeInTheDocument();

    const previa = screen.getByRole('button', { name: 'Visualizar planilha-total.png' });
    expect(previa.tagName).toBe('BUTTON');

    const nome = screen.getByRole('button', { name: 'planilha-total.png' });
    expect(nome.tagName).toBe('BUTTON');
    expect(nome).toHaveAttribute('title', 'planilha-total.png');
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

  it('etapa 17: a imagem da prévia usa object-contain (print de planilha não é cortado)', () => {
    renderCard();
    const img = within(screen.getByRole('button', { name: 'Visualizar planilha-total.png' })).getByRole('img');
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

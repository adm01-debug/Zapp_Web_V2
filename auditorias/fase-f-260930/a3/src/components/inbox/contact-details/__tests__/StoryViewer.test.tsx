import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';

// `getMediaBase64` precisa manter identidade estavel entre renders: se a fabrica do mock devolvesse
// uma funcao nova a cada render, o efeito de midia do StoryViewer rodaria a cada render.
const mockGetMediaBase64 = vi.fn();
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ getMediaBase64: mockGetMediaBase64 }),
}));

vi.mock('@/lib/formatters', () => ({ formatRelativeTime: () => 'há 1h' }));

vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => {},
}));

import { StoryViewer } from '../StoryViewer';

const agora = () => Math.floor(Date.now() / 1000);

const statusTexto = (texto: string): WhatsAppStatusMessage =>
  ({
    key: { remoteJid: 'status@broadcast', fromMe: false, id: `txt-${texto}` },
    message: { conversation: texto },
    messageTimestamp: agora(),
  }) as unknown as WhatsAppStatusMessage;

const statusImagem = (id: string): WhatsAppStatusMessage =>
  ({
    key: { remoteJid: 'status@broadcast', fromMe: false, id },
    message: { imageMessage: { mimetype: 'image/jpeg' } },
    messageTimestamp: agora(),
  }) as unknown as WhatsAppStatusMessage;

const props = (over: Partial<Parameters<typeof StoryViewer>[0]> = {}) => ({
  messages: [statusTexto('Primeiro status'), statusTexto('Segundo status'), statusTexto('Terceiro status')],
  initialIndex: 0,
  open: true,
  onClose: vi.fn(),
  pushName: 'Contato',
  ...over,
});

describe('StoryViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { __activeInstance__?: string }).__activeInstance__ = 'instancia-1';
  });

  it('abre no status indicado por initialIndex', () => {
    render(<StoryViewer {...props({ initialIndex: 1 })} />);

    expect(screen.getByText('Segundo status')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('navega entre os status com as setas do teclado', () => {
    render(<StoryViewer {...props()} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2/3')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  // Semantica que o efeito antigo (`if (open) setIndex(initialIndex)`) garantia e que agora vem do
  // `key` que o pai troca a cada abertura: com key nova, o estado do visualizador comeca limpo.
  it('comeca no initialIndex quando o pai abre com uma key nova', () => {
    const base = props();
    const { rerender } = render(<StoryViewer key="sessao-1" {...base} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2/3')).toBeInTheDocument();

    rerender(<StoryViewer key="sessao-2" {...base} />);

    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.queryByText('2/3')).not.toBeInTheDocument();
  });

  it('carrega a midia do status atual e passa a do proximo ao navegar', async () => {
    mockGetMediaBase64.mockImplementation((_instancia: string, msg: WhatsAppStatusMessage) =>
      Promise.resolve({ base64: `base64-${msg.key?.id}`, mimetype: 'image/jpeg' }),
    );

    render(<StoryViewer {...props({ messages: [statusImagem('a'), statusImagem('b')] })} />);

    await waitFor(() => {
      expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toContain(
        'data:image/jpeg;base64,base64-a',
      );
    });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toContain(
        'data:image/jpeg;base64,base64-b',
      );
    });
    expect(mockGetMediaBase64).toHaveBeenCalledTimes(2);
  });

  // Pina o comportamento que o reset sincrono no topo do effect garantia: ao trocar de status, a
  // midia do status anterior sai de cena (aqui, a segunda midia nunca resolve, entao o que sobra e o
  // estado de carregamento — e nao a imagem antiga).
  it('nao mantem a midia do status anterior ao trocar de status', async () => {
    const srcs = () => screen.queryAllByRole('img').map((img) => img.getAttribute('src'));

    mockGetMediaBase64
      .mockResolvedValueOnce({ base64: 'base64-a', mimetype: 'image/jpeg' })
      .mockReturnValueOnce(new Promise(() => {}));

    render(<StoryViewer {...props({ messages: [statusImagem('a'), statusImagem('b')] })} />);

    await waitFor(() => {
      expect(srcs()).toContain('data:image/jpeg;base64,base64-a');
    });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(srcs()).not.toContain('data:image/jpeg;base64,base64-a');
    });
  });

  it('mostra o erro de midia do status quando o carregamento falha', async () => {
    mockGetMediaBase64.mockRejectedValue(new Error('falha ao baixar'));

    render(<StoryViewer {...props({ messages: [statusImagem('quebrada')] })} />);

    expect(await screen.findByText('falha ao baixar')).toBeInTheDocument();
  });
});

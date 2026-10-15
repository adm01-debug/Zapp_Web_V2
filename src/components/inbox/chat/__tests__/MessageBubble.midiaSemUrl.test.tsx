/**
 * MessageBubble — mídia sem URL mostra placeholder, nunca balão vazio.
 *
 * Cobre o pedido do cartão: mensagem de mídia (`image`, `video`, `audio`,
 * `document`, `sticker`) sem `mediaUrl` mostra placeholder com `role="status"` —
 * 'Baixando…' quando recente (mais nova que MIDIA_BAIXANDO_LIMITE_MS) e sem falha
 * marcada, 'Mídia indisponível' quando mais antiga que o limite ou com falha
 * marcada (`status === 'failed'`) — com frase neutra por tipo e direção
 * (recebido x enviado), sem gênero errado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MessageBubble } from '../MessageBubble';
import { MIDIA_BAIXANDO_LIMITE_MS } from '../../MediaPreview';
import type { Message } from '@/types/chat';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { name: 'Atendente' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        copy: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: async () => ({ error: null }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, requestPermission: vi.fn() }),
}));

vi.mock('@/components/inbox/chat/messageUtils', async (importarOriginal) => {
  const atual = await importarOriginal<typeof import('@/components/inbox/chat/messageUtils')>();
  return { ...atual, MessageStatusIcon: () => null };
});

// Previews reais de documento/vídeo pedem storage/permissão: anula os dois, mas
// mantém o módulo real (MediaMissing + MIDIA_BAIXANDO_LIMITE_MS) via importOriginal.
vi.mock('@/components/inbox/MediaPreview', async (importarOriginal) => {
  const atual = await importarOriginal<typeof import('@/components/inbox/MediaPreview')>();
  return { ...atual, DocumentPreview: () => null, VideoPreview: () => null };
});

vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/AudioMessagePlayer', () => ({ AudioMessagePlayer: () => null }));
vi.mock('@/components/inbox/InteractiveMessage', () => ({
  InteractiveMessageDisplay: () => null,
  ButtonResponseBadge: () => null,
}));
vi.mock('@/components/inbox/ReplyQuote', () => ({ QuotedMessage: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));
vi.mock('@/components/inbox/DeletedMessagePlaceholder', () => ({ DeletedMessagePlaceholder: () => null }));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/components/inbox/TextToSpeechButton', () => ({ TextToSpeechButton: () => null }));
vi.mock('@/components/inbox/MessageReactions', () => ({
  MessageReactions: () => null,
  QuickReactionBar: () => null,
}));
vi.mock('@/components/inbox/chat/HighlightedText', () => ({
  HighlightedText: ({ text }: { text: string }) => <>{text}</>,
}));
vi.mock('@/components/inbox/chat/MessageHoverToolbar', () => ({ MessageHoverToolbar: () => null }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  AvatarImage: () => null,
}));
vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({
      children,
      whileHover: _whileHover,
      transition: _transition,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

type TipoMidia = 'image' | 'video' | 'audio' | 'document' | 'sticker';

const ROTULO: Record<TipoMidia, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  sticker: 'Figurinha',
};

const TIPOS: TipoMidia[] = ['image', 'video', 'audio', 'document', 'sticker'];

const AGORA = Date.now();
const RECENTE = new Date(AGORA - 60_000);
const ANTIGA = new Date(AGORA - (MIDIA_BAIXANDO_LIMITE_MS + 60_000));
const NO_LIMITE = new Date(AGORA - MIDIA_BAIXANDO_LIMITE_MS);

function linha(parcial: Partial<Message> & { type: Message['type'] }): Message {
  return {
    id: `m-${parcial.type}-${Math.random().toString(36).slice(2)}`,
    content: '',
    sender: 'contact',
    timestamp: RECENTE,
    ...parcial,
  } as Message;
}

const PROPS_BASE = {
  isFirstInGroup: true,
  isLastInGroup: true,
  ttsLoading: false,
  ttsPlaying: false,
  ttsMessageId: null,
  onSpeak: vi.fn(),
  onStop: vi.fn(),
  onReply: vi.fn(),
  onForward: vi.fn(),
  onCopy: vi.fn(),
  onScrollToMessage: vi.fn(),
  onInteractiveButtonClick: vi.fn(),
  onMessageDeleted: vi.fn(),
  registerRef: vi.fn(),
} as const;

describe('MessageBubble — mídia sem URL mostra placeholder, nunca balão vazio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
  });

  it.each(TIPOS)('tipo %s recente mostra "Baixando…" com role="status"', (tipo) => {
    render(<MessageBubble {...PROPS_BASE} message={linha({ type: tipo, timestamp: RECENTE })} />);

    const regioes = screen.getAllByRole('status');
    expect(regioes.length).toBeGreaterThan(0);
    const baixa = regioes.find((el) => /Baixando/i.test(el.textContent ?? ''));
    expect(baixa).toBeTruthy();
    expect(baixa!.textContent?.toLowerCase()).toContain(ROTULO[tipo].toLowerCase());
    // Sem role="note": o estado da mídia é anunciado como status.
    expect(screen.queryByRole('note')).toBeNull();
  });

  it.each(TIPOS)('tipo %s antigo (além do limite) mostra "indisponível" com role="status"', (tipo) => {
    render(<MessageBubble {...PROPS_BASE} message={linha({ type: tipo, timestamp: ANTIGA })} />);

    const indisponivel = screen.getByRole('status', { name: new RegExp(`${ROTULO[tipo]} indisponível`, 'i') });
    expect(indisponivel.textContent).toContain('A mídia não foi recebida.');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it.each(TIPOS)('tipo %s recente com falha marcada mostra "indisponível", não "Baixando…"', (tipo) => {
    render(
      <MessageBubble
        {...PROPS_BASE}
        message={linha({ type: tipo, timestamp: RECENTE, status: 'failed' })}
      />,
    );

    expect(screen.queryByText(/Baixando/i)).toBeNull();
    const indisponivel = screen.getByRole('status', { name: new RegExp(`${ROTULO[tipo]} indisponível`, 'i') });
    expect(indisponivel).toBeTruthy();
  });

  it('no limite exato vira "indisponível" (regra: idade < limite para "Baixando…")', () => {
    render(<MessageBubble {...PROPS_BASE} message={linha({ type: 'image', timestamp: NO_LIMITE })} />);

    expect(screen.queryByText(/Baixando/i)).toBeNull();
    expect(screen.getByRole('status', { name: /Imagem indisponível/i })).toBeTruthy();
  });

  it('balão ENVIADO recente mostra "Enviando…" e antigo mostra "não foi enviada" (direção separada)', () => {
    const { unmount } = render(
      <MessageBubble {...PROPS_BASE} message={linha({ type: 'video', sender: 'agent', timestamp: RECENTE })} />,
    );
    expect(screen.getByRole('status', { name: /Enviando vídeo…/i })).toBeTruthy();
    unmount();

    render(
      <MessageBubble {...PROPS_BASE} message={linha({ type: 'video', sender: 'agent', timestamp: ANTIGA })} />,
    );
    const indisponivel = screen.getByRole('status', { name: /Vídeo indisponível/i });
    expect(indisponivel.textContent).toContain('A mídia não foi enviada.');
  });

  it('balão RECEBIDO antigo diz "não foi recebida" (sujeito "mídia", sem erro de gênero)', () => {
    render(<MessageBubble {...PROPS_BASE} message={linha({ type: 'document', timestamp: ANTIGA })} />);

    const indisponivel = screen.getByRole('status', { name: /Documento indisponível/i });
    expect(indisponivel.textContent).toContain('A mídia não foi recebida.');
    // O particípio nunca vai direto no rótulo do tipo (era o bug: 'Documento não foi recebida').
    expect(indisponivel.textContent).not.toContain('Documento não foi');
    expect(indisponivel.textContent).not.toContain('não foi recebido');
  });

  it('placeholder não inventa <img>/<video>/<audio>/<source> e não tem botão de ação falsa', () => {
    const { container } = render(
      <MessageBubble {...PROPS_BASE} message={linha({ type: 'audio', timestamp: ANTIGA })} />,
    );

    expect(screen.getByRole('status', { name: /Áudio indisponível/i })).toBeTruthy();
    expect(container.querySelector('img,video,audio,source')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('horário continua visível no balão de mídia sem URL', () => {
    render(<MessageBubble {...PROPS_BASE} message={linha({ type: 'image', timestamp: RECENTE })} />);

    expect(screen.getByText(/\d{2}:\d{2}/)).toBeTruthy();
  });

  it('mídia COM url não mostra placeholder', () => {
    render(
      <MessageBubble
        {...PROPS_BASE}
        message={linha({ type: 'image', mediaUrl: 'https://exemplo.test/foto.jpg', timestamp: ANTIGA })}
      />,
    );

    expect(screen.queryByText(/Baixando|indisponível/i)).toBeNull();
  });

  it('mensagem de texto não é afetada', () => {
    render(
      <MessageBubble {...PROPS_BASE} message={linha({ type: 'text', content: 'olá', timestamp: ANTIGA })} />,
    );

    expect(screen.getByText('olá')).toBeTruthy();
    expect(screen.queryByText(/Baixando|indisponível/i)).toBeNull();
  });

  it('visual usa só tokens do sistema (claro e escuro) e registra as duas capturas', () => {
    const casos = [
      { nome: 'baixando', message: linha({ type: 'image', timestamp: RECENTE }) },
      { nome: 'indisponivel', message: linha({ type: 'image', timestamp: ANTIGA }) },
    ] as const;

    mkdirSync('.tmp', { recursive: true });
    for (const tema of ['claro', 'escuro'] as const) {
      document.documentElement.classList.toggle('dark', tema === 'escuro');
      for (const caso of casos) {
        const { container, unmount } = render(<MessageBubble {...PROPS_BASE} message={caso.message} />);
        const regiao = screen.getByRole('status');
        // Nenhuma cor chapada no placeholder: só classes de token (sem #hex).
        const comHex = [...regiao.querySelectorAll('*'), regiao].filter((el) =>
          /#[0-9a-fA-F]{3,8}/.test(el.getAttribute('class') ?? ''),
        );
        expect(comHex).toEqual([]);
        writeFileSync(`.tmp/captura-midia-sem-url-${caso.nome}-${tema}.html`, container.innerHTML, 'utf8');
        unmount();
      }
    }
    document.documentElement.classList.remove('dark');
  });
});

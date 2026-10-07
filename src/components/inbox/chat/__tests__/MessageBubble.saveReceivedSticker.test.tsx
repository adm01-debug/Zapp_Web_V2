import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';

// #92A / R2-INB-049 — ao salvar uma figurinha RECEBIDA na biblioteca, o INSERT
// de `stickers.image_url` não pode reaproveitar a URL da mensagem em
// `whatsapp-media`: a biblioteca precisa de cópia própria no bucket `stickers`.
// O teste também prova que falha de cópia/insert não anuncia sucesso e não
// deixa o objeto recém-publicado órfão quando a compensação é possível.

const RECEIVED_URL =
  'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/msg-recebida-92a.webp';
const COPIED_URL =
  'https://proj.supabase.co/storage/v1/object/public/stickers/recebida_copia_92a.webp';

const mocks = vi.hoisted(() => ({
  // tabela `stickers`
  selectEq: vi.fn(),
  selectMaybeSingle: vi.fn(),
  insert: vi.fn(),
  // storage `stickers`
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  // edge function
  invoke: vi.fn(),
  // fetch usado para baixar a mídia recebida
  fetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'stickers') throw new Error(`tabela inesperada no teste: ${table}`);
      return {
        select: () => ({ eq: mocks.selectEq }),
        insert: mocks.insert,
      };
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== 'stickers') throw new Error(`bucket inesperado no teste: ${bucket}`);
        return {
          upload: mocks.upload,
          getPublicUrl: mocks.getPublicUrl,
          remove: mocks.remove,
        };
      },
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { name: 'Ana' } }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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

vi.mock('@/components/inbox/DeletedMessagePlaceholder', () => ({ DeletedMessagePlaceholder: () => null }));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/MediaPreview', () => ({ DocumentPreview: () => null, VideoPreview: () => null }));
vi.mock('@/components/inbox/AudioMessagePlayer', () => ({ AudioMessagePlayer: () => null }));
vi.mock('@/components/inbox/InteractiveMessage', () => ({
  InteractiveMessageDisplay: () => null,
  ButtonResponseBadge: () => null,
}));
vi.mock('@/components/inbox/ReplyQuote', () => ({ QuotedMessage: () => null }));
vi.mock('@/components/inbox/TextToSpeechButton', () => ({ TextToSpeechButton: () => null }));
vi.mock('@/components/inbox/MessageReactions', () => ({
  MessageReactions: () => null,
  QuickReactionBar: () => null,
}));
vi.mock('@/components/inbox/chat/HighlightedText', () => ({
  HighlightedText: ({ text }: { text: string }) => <>{text}</>,
}));
vi.mock('@/components/inbox/chat/MessageHoverToolbar', () => ({ MessageHoverToolbar: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  AvatarImage: () => null,
}));

const makeMessage = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm-92a',
    content: '',
    sender: 'contact',
    timestamp: new Date('2026-10-05T12:00:00Z'),
    type: 'sticker',
    mediaUrl: RECEIVED_URL,
    ...over,
  }) as Message;

function renderBubble(message: Message) {
  render(
    <MessageBubble
      message={message}
      isFirstInGroup
      isLastInGroup
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onScrollToMessage={vi.fn()}
      onInteractiveButtonClick={vi.fn()}
      onMessageDeleted={vi.fn()}
      registerRef={vi.fn()}
    />
  );
}

const saveButton = () => screen.getByTitle('Salvar na biblioteca');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectEq.mockImplementation((_column: string, value: string) => ({
    maybeSingle: () => mocks.selectMaybeSingle(value),
  }));
  mocks.selectMaybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.invoke.mockResolvedValue({ data: { category: 'recebidas' }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: COPIED_URL } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(['sticker-bytes'], { type: 'image/webp' }),
  });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MessageBubble — salvar figurinha recebida copia a mídia (#92A)', () => {
  it('baixa a mídia recebida, publica cópia no bucket stickers e insere a URL da cópia', async () => {
    const message = makeMessage();
    renderBubble(message);

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));

    // 1. a origem do download é a mídia RECEBIDA (whatsapp-media)
    expect(mocks.fetch).toHaveBeenCalledWith(RECEIVED_URL);

    // 2. o upload vai para o bucket `stickers`, em caminho próprio e único
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [storagePath, blob, opts] = mocks.upload.mock.calls[0];
    expect(String(storagePath)).not.toContain('whatsapp-media');
    expect(String(storagePath)).toMatch(/^recebida_/);
    expect(String(storagePath)).toMatch(/\.webp$/);
    expect(blob).toBeInstanceOf(Blob);
    expect((opts as { contentType: string }).contentType).toBe('image/webp');

    // 3. a URL publicada é a da cópia — nunca a da mensagem
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ image_url: COPIED_URL });
    expect(mocks.insert.mock.calls[0][0].image_url).not.toBe(RECEIVED_URL);

    // 4. sucesso anunciado e nada compensado
    expect(mocks.toast).toHaveBeenCalledWith({ title: '✅ Figurinha salva como "recebidas"!' });
    expect(mocks.remove).not.toHaveBeenCalled();

    // 5. a mensagem original permanece intacta
    expect(message.mediaUrl).toBe(RECEIVED_URL);
  });

  it('salvar a mesma mensagem duas vezes não repete upload nem INSERT', async () => {
    mocks.selectMaybeSingle.mockImplementation((imageUrl: string) =>
      Promise.resolve({
        data: imageUrl === COPIED_URL && mocks.insert.mock.calls.length === 1 ? { id: 'sticker-92a' } : null,
        error: null,
      })
    );
    renderBubble(makeMessage());

    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));

    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ title: 'Figurinha já está na biblioteca!' })
    );

    expect(mocks.selectEq).toHaveBeenCalledTimes(2);
    expect(mocks.selectEq).toHaveBeenNthCalledWith(1, 'image_url', COPIED_URL);
    expect(mocks.selectEq).toHaveBeenNthCalledWith(2, 'image_url', COPIED_URL);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('falha na checagem de duplicidade sem copiar nem inserir', async () => {
    mocks.selectMaybeSingle.mockResolvedValue({ data: null, error: { message: 'consulta indisponível' } });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('falha no upload: sem toast de sucesso, sem INSERT', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'quota' } });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });

  it('falha no INSERT: sem toast de sucesso e remove o objeto recém-publicado', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'rls denied' } });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));

    const [removedPaths] = mocks.remove.mock.calls[0];
    const [uploadedPath] = mocks.upload.mock.calls[0];
    expect(removedPaths).toEqual([uploadedPath]);
    expect(String(uploadedPath)).not.toContain('whatsapp-media');

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao salvar figurinha',
      variant: 'destructive',
    });
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });

  // R2-INB-038 (aceite 3): o insert pode REJEITAR a promessa, e não só resolver com
  // { error }. Nos dois casos não pode haver toast de sucesso nem sobrar a cópia
  // publicada no bucket.
  it('insert REJEITADO (promessa) não anuncia sucesso e compensa o objeto publicado', async () => {
    mocks.insert.mockRejectedValue(new Error('falha de transporte'));
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));

    const [removedPaths] = mocks.remove.mock.calls[0];
    const [uploadedPath] = mocks.upload.mock.calls[0];
    expect(removedPaths).toEqual([uploadedPath]);
    expect(String(uploadedPath)).not.toContain('whatsapp-media');

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao salvar figurinha',
      variant: 'destructive',
    });
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });

  it('falha ao baixar a mídia recebida: erro explícito, sem upload e sem INSERT', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob([]) });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';
import { parseSupabaseStorageObjectUrl, PRIVATE_MEDIA_BUCKETS } from '@/lib/storage_object_reference';
import { SUPABASE_URL } from '@/config/supabase';

// SEC-SAIDAS_DE_INFORMACAO-03 (Y29 P0-03) — a figurinha RECEBIDA de cliente era copiada para o
// bucket PÚBLICO `stickers` e a biblioteca guardava a URL pública permanente (`getPublicUrl`),
// deixando conteúdo de conversa legível sem sessão.
//
// O contrato que este teste prende: a cópia fica DENTRO do bucket privado da mídia de conversa
// (`whatsapp-media`), na pasta do usuário que salva, e `stickers.image_url` recebe o locator
// durável dessa cópia — o formato que a biblioteca já resolve por URL assinada
// (`useResolvedStorageUrl` + `PRIVATE_MEDIA_BUCKETS`, provado em
// src/components/inbox/stickers/__tests__/StickerGrid.resolucao.test.tsx).
//
// O mock de Storage RECUSA outro bucket: se o código voltar a tocar `stickers` (publicar ou
// ler URL pública de mídia de conversa), o teste falha. O mock de `fetch` global também segue
// instalado para provar que o arquivo não é baixado pelo navegador.

const ORIGIN = new URL(SUPABASE_URL).origin;
const RECEIVED_URL = `${ORIGIN}/storage/v1/object/public/whatsapp-media/sticker/msg-recebida-92a.webp`;
const RECEIVED_PATH = 'sticker/msg-recebida-92a.webp';
const USER_ID = 'user-92a';
const DEST_PATH = `${USER_ID}/stickers/recebida_m-92a.webp`;
const DEST_LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/${DEST_PATH}`;

const mocks = vi.hoisted(() => ({
  // tabela `stickers`
  selectEq: vi.fn(),
  selectMaybeSingle: vi.fn(),
  insert: vi.fn(),
  // storage (bucket privado da conversa)
  storageFrom: vi.fn(),
  copy: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  // sessão do usuário que salva
  getUser: vi.fn(),
  // edge function
  invoke: vi.fn(),
  // fetch global: a cópia NÃO pode passar pelo navegador
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
        if (bucket !== 'whatsapp-media') {
          throw new Error(`bucket inesperado no teste (bucket público?): ${bucket}`);
        }
        mocks.storageFrom(bucket);
        return {
          copy: mocks.copy,
          getPublicUrl: mocks.getPublicUrl,
          remove: mocks.remove,
        };
      },
    },
    auth: { getUser: mocks.getUser },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { name: 'Ana' }, user: { id: USER_ID } }),
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

/** Referência gravada na biblioteca, como o leitor (StickerGrid) a interpreta. */
const storedReference = () => {
  const inserted = mocks.insert.mock.calls[0][0] as { image_url: string };
  return parseSupabaseStorageObjectUrl(inserted.image_url, PRIVATE_MEDIA_BUCKETS);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectEq.mockImplementation((_column: string, value: string) => ({
    maybeSingle: () => mocks.selectMaybeSingle(value),
  }));
  mocks.selectMaybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.invoke.mockResolvedValue({ data: { category: 'recebidas' }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.copy.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: DEST_LOCATOR } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MessageBubble — salvar figurinha recebida na biblioteca (Y29 P0-03)', () => {
  it('copia a mídia recebida DENTRO do bucket privado e grava o locator da cópia', async () => {
    const message = makeMessage();
    renderBubble(message);

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));

    // 1. a cópia é server-side, dentro de `whatsapp-media`, em pasta própria do usuário
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.copy).toHaveBeenCalledWith(RECEIVED_PATH, DEST_PATH);

    // 2. o arquivo NÃO passa pelo navegador (nenhum download da mídia de conversa)
    expect(mocks.fetch).not.toHaveBeenCalled();

    // 3. o locator gravado aponta para o objeto privado; o leitor assina esse objeto
    const inserted = mocks.insert.mock.calls[0][0] as { image_url: string };
    expect(inserted.image_url).toBe(DEST_LOCATOR);
    expect(inserted.image_url).not.toBe(RECEIVED_URL);
    expect(storedReference()).toEqual({ bucket: 'whatsapp-media', path: DEST_PATH });
    expect(PRIVATE_MEDIA_BUCKETS).toContain('whatsapp-media');

    // 4. sucesso anunciado e nada compensado
    expect(mocks.toast).toHaveBeenCalledWith({ title: '✅ Figurinha salva como "recebidas"!' });
    expect(mocks.remove).not.toHaveBeenCalled();

    // 5. a mensagem original permanece intacta
    expect(message.mediaUrl).toBe(RECEIVED_URL);
  });

  it('salvar a mesma mensagem duas vezes não repete a cópia nem o INSERT', async () => {
    mocks.selectMaybeSingle.mockImplementation((imageUrl: string) =>
      Promise.resolve({
        data: imageUrl === DEST_LOCATOR && mocks.insert.mock.calls.length === 1 ? { id: 'sticker-92a' } : null,
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
    expect(mocks.selectEq).toHaveBeenNthCalledWith(1, 'image_url', DEST_LOCATOR);
    expect(mocks.selectEq).toHaveBeenNthCalledWith(2, 'image_url', DEST_LOCATOR);
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('mídia da mensagem fora de bucket privado reconhecido: erro, sem cópia e sem INSERT', async () => {
    renderBubble(makeMessage({ mediaUrl: 'https://cdn.externo.example/figurinha.webp' }));

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('sem sessão: erro, sem pasta de usuário, sem cópia e sem INSERT', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
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
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('falha na cópia: sem toast de sucesso, sem INSERT e sem compensar objeto que não nasceu', async () => {
    mocks.copy.mockResolvedValue({ error: { message: 'quota' } });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Erro ao salvar figurinha',
        variant: 'destructive',
      })
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });

  it('falha no INSERT: sem toast de sucesso e remove a cópia recém-publicada', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'rls denied' } });
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));

    // a compensação remove o objeto da cópia, no bucket privado, pelo caminho copiado
    const [removedPaths] = mocks.remove.mock.calls[0];
    expect(removedPaths).toEqual([DEST_PATH]);
    const [, destinationPath] = mocks.copy.mock.calls[0];
    expect(removedPaths).toEqual([destinationPath]);

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao salvar figurinha',
      variant: 'destructive',
    });
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });

  // R2-INB-038 (aceite 3): o insert pode REJEITAR a promessa, e não só resolver com
  // { error }. Nos dois casos não pode haver toast de sucesso nem sobrar a cópia no bucket.
  it('insert REJEITADO (promessa) não anuncia sucesso e compensa o objeto copiado', async () => {
    mocks.insert.mockRejectedValue(new Error('falha de transporte'));
    renderBubble(makeMessage());

    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));

    const [removedPaths] = mocks.remove.mock.calls[0];
    const [, destinationPath] = mocks.copy.mock.calls[0];
    expect(removedPaths).toEqual([destinationPath]);

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao salvar figurinha',
      variant: 'destructive',
    });
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('✅') })
    );
  });
});

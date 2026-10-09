import { useCallback, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Reply, Forward, Copy, Download } from 'lucide-react';
import { SwipeableMessage } from '@/components/mobile/SwipeableMessage';
import { DeletedMessagePlaceholder } from '../DeletedMessagePlaceholder';
import { HighlightedText } from './HighlightedText';
import { Message, InteractiveButton } from '@/types/chat';
import { TypingIndicator } from '../TypingIndicator';
import { MessageReactions, QuickReactionBar } from '../MessageReactions';
import { MessageHoverToolbar } from './MessageHoverToolbar';
import { MessageImage } from '../ImagePreview';
import { DocumentPreview, VideoPreview } from '../MediaPreview';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { InteractiveMessageDisplay, ButtonResponseBadge } from '../InteractiveMessage';
import { QuotedMessage } from '../ReplyQuote';
const LocationMessageDisplay = lazy(() =>
  import('../LocationMessage').then(m => ({ default: m.LocationMessageDisplay }))
);
import { TextToSpeechButton } from '../TextToSpeechButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatMessageTime, MessageStatusIcon } from './messageUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/ui/use-toast';
import { QuarantineBadge } from '@/components/security/QuarantineBadge';
import { LinkPreviewCard } from './LinkPreviewCard';
import {
  PRIVATE_MEDIA_BUCKETS,
  parseSupabaseStorageObjectUrl,
  type StorageObjectReference,
} from '@/lib/storage_object_reference';
import { SUPABASE_URL } from '@/config/supabase';

import { getLogger } from '@/lib/logger';
const log = getLogger('MessageBubble');

// SEC-SAIDAS_DE_INFORMACAO-03 (Y29 P0-03): a figurinha RECEBIDA de cliente era copiada para
// o bucket PÚBLICO `stickers` e a biblioteca guardava a URL pública permanente
// (`getPublicUrl`) — conteúdo de conversa legível sem sessão. A cópia agora vive DENTRO do
// bucket privado da mídia de conversa (`whatsapp-media`), na mesma família de
// PRIVATE_MEDIA_BUCKETS, e é referenciada por um locator durável que a biblioteca resolve
// por URL assinada (useResolvedStorageUrl). A cópia continua existindo porque a biblioteca
// não pode compartilhar o objeto da mensagem: apagar a mensagem/arquivo não pode quebrar o
// catálogo.

const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;

/** Cópia própria da figurinha recebida, sempre dentro de um bucket PRIVADO. */
interface ReceivedStickerCopy {
  bucket: string;
  storagePath: string;
  /** Locator durável (formato `/object/public/…`): identifica o objeto, não o abre. */
  url: string;
}

/**
 * Objeto de origem da cópia. Devolve `null` quando a mídia da mensagem não é um objeto de
 * bucket privado conhecido: sem isso não existe origem dentro do perímetro de onde copiar,
 * e a saída é falhar explicitamente em vez de publicar mídia de conversa em bucket aberto.
 */
function resolveReceivedStickerSource(mediaUrl: string): StorageObjectReference | null {
  return parseSupabaseStorageObjectUrl(mediaUrl, PRIVATE_MEDIA_BUCKETS, STORAGE_ORIGINS);
}

function extensionFromObjectPath(path: string): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  return match ? match[1].toLowerCase() : 'webp';
}

/**
 * O destino é derivado do id estável da mensagem. Assim o locator da cópia também é estável
 * e pode ser usado para detectar um segundo salvamento antes da cópia.
 *
 * O PRIMEIRO segmento do caminho é a pasta do usuário que salva: é o prefixo que a policy de
 * INSERT de `whatsapp-media` autoriza para quem não é admin/supervisor (a outra opção é a
 * pasta de um contato atribuído, que o balão não conhece). Efeito assumido: a cópia é
 * legível por quem a salvou — abrir para o time exigiria mudar a policy do bucket, que é
 * trilha de banco.
 */
function getReceivedStickerDestination(
  source: StorageObjectReference,
  userId: string,
  messageId: string
): ReceivedStickerCopy {
  const storagePath = `${userId}/stickers/recebida_${encodeURIComponent(messageId)}.${extensionFromObjectPath(source.path)}`;
  const { data } = supabase.storage.from(source.bucket).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('Falha ao definir o destino da cópia da figurinha');
  return { bucket: source.bucket, storagePath, url: data.publicUrl };
}

/**
 * Copia a mídia recebida para o destino próprio da biblioteca, dentro do MESMO bucket
 * privado. `copy` é server-side: as policies do Storage decidem a leitura da origem e a
 * escrita do destino, e o arquivo não passa pelo navegador.
 */
async function copyReceivedStickerToLibrary(
  source: StorageObjectReference,
  destination: ReceivedStickerCopy
): Promise<ReceivedStickerCopy> {
  const { error } = await supabase.storage.from(source.bucket).copy(source.path, destination.storagePath);
  if (error) throw error;
  return destination;
}

/**
 * SL-197 (inventário 029 · Inbox/Chat / Resiliência) — métrica de retry por mensagem.
 *
 * `messages.delivery_attempt_count` é o contador de tentativas de entrega do banco
 * (incrementado a cada claim em `claim_message_delivery`) e a linha crua chega ao
 * balão via `useRealtimeMessages`/`buildConversation`. Só a mensagem ENVIADA tem
 * tentativas de entrega, e só há o que mostrar quando houve REENVIO: com 1 tentativa
 * o valor é o caminho normal e exibir o número em todo balão viraria ruído.
 */
function tentativasDeEnvio(message: Message): number | null {
  if (message.sender !== 'agent') return null;
  const total = message.delivery_attempt_count;
  return typeof total === 'number' && total > 1 ? total : null;
}

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  contactAvatar?: string;
  instanceName?: string;
  contactJid?: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  highlightedMessageIds?: Set<string>;
  activeHighlightId?: string | null;
  searchQuery?: string;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onEditStart?: (message: Message) => void;
  onMessageDeleted: (messageId: string) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

import { memo } from 'react';

export const MessageBubble = memo(function MessageBubble({
  message, isFirstInGroup, isLastInGroup, contactAvatar, instanceName, contactJid,
  ttsLoading, ttsPlaying, ttsMessageId, highlightedMessageIds, activeHighlightId, searchQuery,
  onSpeak, onStop, onReply, onForward, onCopy, onScrollToMessage, onInteractiveButtonClick,
  onEditStart, onMessageDeleted, registerRef,
}: MessageBubbleProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const isSent = message.sender === 'agent';
  const tentativas = tentativasDeEnvio(message);
  const senderName = isSent ? 'Você' : message.senderName || 'Contato';
  const agentInitials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : 'EU';

  return (
      <SwipeableMessage onSwipeRight={() => onReply(message)} onSwipeLeft={() => onForward(message)}>
        <div
          ref={registerRef}
          data-testid="message-group"
          data-search-highlight={highlightedMessageIds?.has(message.id) ? 'true' : undefined}
          className={cn(
            'flex group gap-2.5 transition-all duration-300',
            isSent ? 'justify-end' : 'justify-start',
            !isLastInGroup && 'mb-0.5',
            highlightedMessageIds?.has(message.id) && 'relative',
            activeHighlightId === message.id && 'ring-2 ring-[hsl(var(--warning))] ring-offset-1 ring-offset-background rounded-2xl animate-[pulse_1.5s_ease-in-out_1]',
            highlightedMessageIds?.has(message.id) && activeHighlightId !== message.id && 'bg-[hsl(var(--warning)/0.08)] rounded-2xl',
          )}
        >
          {/* Avatar — received */}
          {!isSent && (
            <div className="w-8 shrink-0">
              {isLastInGroup && (
                <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                  <AvatarImage src={contactAvatar} alt="Avatar do contato" />
                  <AvatarFallback className="bg-gradient-to-br from-accent to-accent/60 text-accent-foreground text-3xs font-bold">
                    {senderName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          )}

          <div className={cn('max-w-[68%] space-y-0.5 relative', isSent && 'items-end')}>
            {!isSent && isFirstInGroup && (
              <span className="text-2xs font-semibold text-primary/80 ml-1 block">{senderName}</span>
            )}

            {/* Floating emoji reactions on hover — WhatsApp Web style */}
            <AnimatePresence>
              <QuickReactionBar
                messageId={message.id}
                isSent={isSent}
                instanceName={instanceName}
                contactJid={contactJid}
                externalId={message.external_id ?? undefined}
                senderType={message.sender}
                refreshKey={message.updated_at}
                disableRealtime
              />
            </AnimatePresence>

            {/* Pill toolbar — WhatsApp Web style */}
            <MessageHoverToolbar
              message={message}
              isSent={isSent}
              instanceName={instanceName}
              contactJid={contactJid}
              ttsLoading={ttsLoading}
              ttsPlaying={ttsPlaying}
              ttsMessageId={ttsMessageId}
              onReply={onReply}
              onForward={onForward}
              onCopy={onCopy}
              onSpeak={onSpeak}
              onStop={onStop}
              onEditStart={onEditStart}
              onMessageDeleted={onMessageDeleted}
            />

            {/* Message bubble */}
            {message.is_deleted ? (
              <DeletedMessagePlaceholder isSent={isSent} content={message.content} />
            ) : (
              <motion.div
                whileHover={{ scale: 1.005 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                  'relative transition-all overflow-hidden',
                  (message.type === 'image' || message.type === 'video') && !message.content ? 'p-0' : 'px-3.5 py-2',
                  isSent
                    ? cn('bg-primary text-primary-foreground shadow-sm',
                        isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-br-md',
                        isFirstInGroup && !isLastInGroup && 'rounded-2xl rounded-br-sm',
                        !isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-tr-sm rounded-br-md',
                        !isFirstInGroup && !isLastInGroup && 'rounded-xl rounded-tr-sm rounded-br-sm')
                    : cn('bg-muted text-foreground shadow-sm',
                        isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-bl-md',
                        isFirstInGroup && !isLastInGroup && 'rounded-2xl rounded-bl-sm',
                        !isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-tl-sm rounded-bl-md',
                        !isFirstInGroup && !isLastInGroup && 'rounded-xl rounded-tl-sm rounded-bl-sm')
                )}
              >
                {message.replyTo && <QuotedMessage replyTo={message.replyTo} isSent={isSent} onClick={() => onScrollToMessage(message.replyTo!.messageId)} />}
                {message.buttonResponse && <ButtonResponseBadge buttonTitle={message.buttonResponse.buttonTitle} isSent={isSent} />}
                {message.type === 'interactive' && message.interactive && <InteractiveMessageDisplay interactive={message.interactive} isSent={isSent} onButtonClick={onInteractiveButtonClick} />}

                {message.type === 'image' && message.mediaUrl && (
                  <div className={cn("overflow-hidden relative", message.content ? "mb-1.5 -mx-1 -mt-0.5 rounded-xl" : "w-full")}>
                    <MessageImage src={message.mediaUrl} />
                    <QuarantineBadge messageId={message.id} className="absolute m-1.5 left-0 top-0" />
                  </div>
                )}

                {message.type === 'video' && message.mediaUrl && (
                  <div className="mb-1.5 relative">
                    <VideoPreview url={message.mediaUrl} caption={message.content} isSent={isSent} />
                    <QuarantineBadge messageId={message.id} className="absolute m-1.5 left-0 top-0" />
                  </div>
                )}

                {message.type === 'audio' && message.mediaUrl && (
                  <div className="mb-1">
                    <AudioMessagePlayer audioUrl={message.mediaUrl} messageId={message.id} isSent={isSent} existingTranscription={message.transcription} transcriptionStatus={message.transcriptionStatus} />
                    <QuarantineBadge messageId={message.id} className="mt-1" />
                    {searchQuery && highlightedMessageIds?.has(message.id) && message.transcription && (
                      <p className="text-2xs mt-1 px-1 italic text-muted-foreground"><HighlightedText text={message.transcription} query={searchQuery} /></p>
                    )}
                  </div>
                )}

                {message.type === 'document' && message.mediaUrl && (
                  <div className="mb-1.5">
                    <DocumentPreview url={message.mediaUrl} fileName={searchQuery && highlightedMessageIds?.has(message.id) && message.content ? '' : (message.content || 'documento')} isSent={isSent} />
                    <QuarantineBadge messageId={message.id} className="mt-1" />
                    {searchQuery && highlightedMessageIds?.has(message.id) && message.content && (
                      <p className="text-xs mt-1 px-1"><HighlightedText text={message.content} query={searchQuery} /></p>
                    )}
                  </div>
                )}

                {message.type === 'location' && message.location && <Suspense fallback={<div className="w-full h-32 bg-muted animate-pulse rounded-lg" />}><LocationMessageDisplay location={message.location} isSent={isSent} /></Suspense>}

                {message.type === 'sticker' && message.mediaUrl && (
                  <div className="mb-1 group/sticker relative">
                    <MessageImage src={message.mediaUrl} alt="Sticker" />
                    <QuarantineBadge messageId={message.id} className="absolute top-1 left-1" />
                    {!isSent && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            // Y29 P0-03: a origem tem de ser um objeto de bucket privado —
                            // é de dentro dele que a cópia nasce.
                            const source = resolveReceivedStickerSource(message.mediaUrl!);
                            if (!source) throw new Error('Mídia da figurinha não é um objeto de bucket privado');
                            const { data: { user }, error: sessionError } = await supabase.auth.getUser();
                            if (sessionError) throw sessionError;
                            if (!user?.id) throw new Error('Sessão não encontrada');
                            const destination = getReceivedStickerDestination(source, user.id, message.id);
                            const { data: existing, error: duplicateCheckError } = await supabase
                              .from('stickers')
                              .select('id')
                              .eq('image_url', destination.url)
                              .maybeSingle();
                            if (duplicateCheckError) throw duplicateCheckError;
                            if (existing) { toast({ title: 'Figurinha já está na biblioteca!' }); return; }
                            toast({ title: '🔍 Classificando figurinha com IA...' });
                            let category = 'recebidas';
                            try {
                              const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-sticker', { body: { image_url: message.mediaUrl } });
                              if (!classifyErr && classifyData?.category) category = classifyData.category;
                            } catch (err) { log.error('Unexpected error in MessageBubble:', err); }
                            // Y29 P0-03: a cópia nasce e fica no bucket privado; a biblioteca
                            // guarda SÓ o locator durável dela.
                            const copy = await copyReceivedStickerToLibrary(source, destination);
                            // R2-INB-038: o insert pode falhar de duas formas — resolver com
                            // { error } (PostgREST/RLS) ou REJEITAR a promessa (falha de
                            // transporte). As duas têm de cair na mesma compensação, senão a
                            // cópia publicada logo acima fica órfã no bucket.
                            let insertError: Error | null = null;
                            try {
                              const { error } = await supabase.from('stickers').insert({ name: `Recebida ${new Date().toLocaleDateString('pt-BR')}`, image_url: copy.url, category, is_favorite: false, use_count: 0 });
                              if (error) insertError = new Error(error.message);
                            } catch (thrown) {
                              insertError = thrown instanceof Error ? thrown : new Error(String(thrown));
                            }
                            if (insertError) {
                              // compensa o objeto recém-copiado: sem INSERT ele ficaria órfão
                              try { await supabase.storage.from(copy.bucket).remove([copy.storagePath]); }
                              catch (cleanupErr) { log.error('Unexpected error in MessageBubble:', cleanupErr); }
                              throw insertError;
                            }
                            toast({ title: `✅ Figurinha salva como "${category}"!` });
                          } catch { toast({ title: 'Erro ao salvar figurinha', variant: 'destructive' }); }
                        }}
                        className="absolute bottom-1 right-1 opacity-0 group-hover/sticker:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-full p-1.5 shadow-md hover:bg-background border border-border/50"
                        title="Salvar na biblioteca"
                      >
                        <Download className="w-3.5 h-3.5 text-foreground" />
                      </button>
                    )}
                  </div>
                )}

                {message.content && message.type !== 'audio' && message.type !== 'location' && message.type !== 'video' && message.type !== 'document' && message.type !== 'sticker' && (
                  <>
                  {message.link_preview && (
                    <LinkPreviewCard preview={message.link_preview} isSent={isSent} />
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-[1.45]">
                    {searchQuery && highlightedMessageIds?.has(message.id) ? <HighlightedText text={message.content} query={searchQuery} /> : message.content}
                  </p>
                  </>
                )}

                <div className={cn(
                  'flex items-center justify-end gap-1 mt-0.5 -mb-0.5',
                  (message.type === 'image' || message.type === 'video') && !message.content
                    ? 'absolute bottom-2 right-3 text-white drop-shadow-md'
                    : isSent ? 'text-primary-foreground' : 'text-muted-foreground',
                  (message.type === 'image' || message.type === 'video') && !message.content && 'px-3.5 pb-1'
                )}>
                  {message.isEdited && <span className="text-[9px] italic mr-0.5">editada</span>}
                  <span className="text-2xs font-medium">{formatMessageTime(message.timestamp)}</span>
                  {isSent && <MessageStatusIcon status={message.status} />}
                  {tentativas !== null && (
                    <span
                      className="text-2xs font-medium tabular-nums"
                      title={`${tentativas} tentativas de envio`}
                    >
                      {tentativas} tentativas
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            <MessageReactions
              messageId={message.id}
              isSent={isSent}
              instanceName={instanceName}
              contactJid={contactJid}
              externalId={message.external_id ?? undefined}
              senderType={message.sender}
              refreshKey={message.updated_at}
                disableRealtime
            />
          </div>

          {/* Avatar — sent */}
          {isSent && (
            <div className="w-8 shrink-0">
              {isLastInGroup && (
                <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                  <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'Perfil'} />
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-3xs font-bold">
                    {agentInitials}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
        </div>
      </SwipeableMessage>
  );
});

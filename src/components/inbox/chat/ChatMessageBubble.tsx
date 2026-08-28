import { useRef, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Message, MessageReaction, InteractiveButton } from '@/types/chat';
import { useSwipeGesture } from '@/hooks/ui/useSwipeGesture';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { motion } from '@/components/ui/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageReactions } from '../MessageReactions';
import { MessageImage } from '../ImagePreview';
import { DocumentPreview, VideoPreview } from '../MediaPreview';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { InteractiveMessageDisplay, ButtonResponseBadge } from '../InteractiveMessage';
import { QuotedMessage } from '../ReplyQuote';
import { TextToSpeechButton } from '../TextToSpeechButton';
import { TextWithLinks } from '../LinkPreview';

// Lazy-load mapbox-heavy LocationMessage component
const LocationMessageDisplay = lazy(() => import('../LocationMessage').then(m => ({ default: m.LocationMessageDisplay })));
import {
  Check,
  CheckCheck,
  Clock,
  X,
  Reply,
  Forward,
  Copy,
} from 'lucide-react';
import { format } from 'date-fns';

interface ChatMessageBubbleProps {
  message: Message;
  reactions: MessageReaction[];
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  registerRef: (messageId: string, el: HTMLDivElement | null) => void;
}

// Message status icon
function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sent':
      return <Check className="w-3 h-3" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-info" />;
    case 'failed':
      return <X className="w-3 h-3 text-destructive" />;
    default:
      return <Clock className="w-3 h-3 animate-pulse" />;
  }
}

function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function ChatMessageBubble({
  message,
  reactions,
  ttsLoading,
  ttsPlaying,
  ttsMessageId,
  onSpeak,
  onStop,
  onReply,
  onForward,
  onCopy,
  onScrollToMessage,
  onInteractiveButtonClick,
  registerRef,
}: ChatMessageBubbleProps) {
  const isSent = message.sender === 'agent';

  const isMobile = useIsMobile();
  
  // Swipe gestures (mobile): right = reply, left = forward
  const { swipeState, handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => onReply(message),
    onSwipeLeft: () => onForward(message),
    enabled: isMobile,
    threshold: 60,
  });

  return (
    <div 
      ref={(el) => registerRef(message.id, el)}
      className={cn('flex group', isSent ? 'justify-end' : 'justify-start')}
      {...swipeHandlers}
    >
      <motion.div
        initial={{ opacity: 0, x: isSent ? 20 : -20, scale: 0.95 }}
        animate={{ 
          opacity: 1, 
          x: swipeState.isSwiping ? swipeState.offsetX : 0, 
          scale: 1 
        }}
        transition={swipeState.isSwiping ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
        className="max-w-[70%] space-y-1 relative"
      >
        {/* Message Actions (visible on hover) */}
        <div className={cn(
          "absolute top-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10",
          isSent ? "right-full mr-2" : "left-full ml-2"
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onReply(message)}
                className="p-1.5 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm"
                aria-label="Responder"
              >
                <Reply className="w-3.5 h-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Responder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onForward(message)}
                className="p-1.5 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm"
                aria-label="Encaminhar"
              >
                <Forward className="w-3.5 h-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Encaminhar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onCopy(message.content)}
                className="p-1.5 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm"
                aria-label="Copiar"
              >
                <Copy className="w-3.5 h-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Copiar</TooltipContent>
          </Tooltip>

          {message.type === 'text' && (
            <TextToSpeechButton
              messageId={message.id}
              text={message.content}
              isLoading={ttsLoading}
              isPlaying={ttsPlaying}
              currentMessageId={ttsMessageId}
              onSpeak={onSpeak}
              onStop={onStop}
              className="p-1.5 rounded-full bg-card border border-border/50 shadow-sm"
            />
          )}
        </div>

        <motion.div
          whileHover={{ scale: 1.01 }}
          className={cn(
            'relative rounded-2xl shadow-sm transition-all overflow-hidden',
            (message.type === 'image' || message.type === 'video') && !message.content
              ? 'p-0'
              : 'px-4 py-2.5',
            isSent 
              ? 'rounded-br-md bg-chat-sent text-chat-sent-foreground' 
              : 'rounded-bl-md bg-chat-received border border-border/30 text-chat-received-foreground'
          )}
        >

          {/* Quoted message (reply) */}
          {message.replyTo && (
            <QuotedMessage
              replyTo={message.replyTo}
              isSent={isSent}
              onClick={() => onScrollToMessage(message.replyTo!.messageId)}
            />
          )}

          {/* Button response badge */}
          {message.buttonResponse && (
            <ButtonResponseBadge 
              buttonTitle={message.buttonResponse.buttonTitle}
              isSent={isSent}
            />
          )}

          {/* Interactive message */}
          {message.type === 'interactive' && message.interactive && (
            <InteractiveMessageDisplay
              interactive={message.interactive}
              isSent={isSent}
              onButtonClick={onInteractiveButtonClick}
            />
          )}

          {/* Image message */}
          {message.type === 'image' && message.mediaUrl && (
            <div className="mb-2 rounded-lg overflow-hidden">
              <MessageImage src={message.mediaUrl} />
            </div>
          )}

          {/* Video message */}
          {message.type === 'video' && message.mediaUrl && (
            <div className="mb-2">
              <VideoPreview
                url={message.mediaUrl}
                caption={message.content}
                isSent={isSent}
              />
            </div>
          )}

          {/* Audio message */}
          {message.type === 'audio' && message.mediaUrl && (
            <div className="mb-2">
              <AudioMessagePlayer
                audioUrl={message.mediaUrl}
                messageId={message.id}
                isSent={isSent}
                existingTranscription={message.transcription}
                transcriptionStatus={message.transcriptionStatus}
              />
            </div>
          )}

          {/* Document message */}
          {message.type === 'document' && message.mediaUrl && (
            <div className="mb-2">
              <DocumentPreview
                url={message.mediaUrl}
                fileName={message.content || 'documento'}
                isSent={isSent}
              />
            </div>
          )}

          {/* Location message - lazy loaded (mapbox is heavy) */}
          {message.type === 'location' && message.location && (
            <Suspense fallback={<div className="w-full h-32 bg-muted animate-pulse rounded-lg" />}>
              <LocationMessageDisplay
                location={message.location}
                isSent={isSent}
              />
            </Suspense>
          )}

          {/* Sticker message */}
          {message.type === 'sticker' && message.mediaUrl && (
            <div className="mb-1">
              <img
                src={message.mediaUrl}
                alt="Sticker"
                className="max-w-[180px] max-h-[180px] object-contain"
                loading="lazy"
              />
            </div>
          )}

          {/* Text content */}
          {message.content && message.type !== 'audio' && message.type !== 'location' && message.type !== 'video' && message.type !== 'document' && message.type !== 'sticker' && (
            <TextWithLinks text={message.content} className="text-sm whitespace-pre-wrap leading-relaxed" maxPreviews={2} />
          )}

          {/* Timestamp and status */}
          <div
            className={cn(
              'flex items-center justify-end gap-1.5 mt-1',
              isSent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            <span className="text-[10px]">
              {formatMessageTime(message.timestamp)}
            </span>
            {isSent && <MessageStatusIcon status={message.status} />}
          </div>
        </motion.div>

        {/* Reactions */}
        <MessageReactions
          messageId={message.id}
          isSent={isSent}
        />
      </motion.div>
    </div>
  );
}

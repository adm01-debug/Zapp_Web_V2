import { useCallback, useMemo, useState } from 'react';
import { Image as ImageIcon, MessageCircle, Type, Video } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/inbox/chat/motion';
import { useWhatsAppStatus, type WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';
import { cn } from '@/lib/utils';
import { StoryViewer } from './StoryViewer';
import { storyKeyOf, storyMediaKind } from './storyUtils';

interface WhatsAppStatusSectionProps {
  phone: string | undefined;
}

const MEDIA_ICON = {
  image: ImageIcon,
  video: Video,
  text: Type,
} as const;

const timeAgo = (timestamp?: number | string): string | null => {
  const seconds = typeof timestamp === 'string' ? Number.parseInt(timestamp, 10) : timestamp;
  if (!seconds || !Number.isFinite(seconds)) return null;
  const deltaMs = Date.now() - seconds * 1000;
  if (deltaMs < 0) return null;
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

function Thumbnail({
  message,
  index,
  seen,
  onOpen,
}: {
  message: WhatsAppStatusMessage;
  index: number;
  seen: boolean;
  onOpen: (index: number) => void;
}) {
  const kind = storyMediaKind(message);
  const Icon = MEDIA_ICON[kind];
  const relative = timeAgo(message.messageTimestamp);

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Abrir status${seen ? '' : ' não visto'} de ${relative ?? 'agora'}`}
      data-testid="whatsapp-status-thumb"
      data-seen={seen ? 'true' : 'false'}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground',
        'motion-safe:transition-transform motion-safe:hover:scale-105',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        seen ? 'ring-1 ring-border' : 'ring-2 ring-whatsapp',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Seção "Status do WhatsApp" do painel de contato.
 *
 * Aparece só quando o contato tem stories — sem selo de presença online (a V2 não
 * tem essa informação). As miniaturas marcam story não visto com anel colorido por
 * token; a mídia só é buscada sob demanda quando o status abre no `StoryViewer`.
 */
export function WhatsAppStatusSection({ phone }: WhatsAppStatusSectionProps) {
  const { statusMessages, loading, instanceName } = useWhatsAppStatus(phone);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const keys = useMemo(
    () => statusMessages.map((message, index) => storyKeyOf(message, index)),
    [statusMessages],
  );
  const unseenCount = keys.filter((key) => !seen.has(key)).length;

  const markSeen = useCallback((key: string) => {
    setSeen((previous) => {
      if (previous.has(key)) return previous;
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card/40 p-3" data-testid="whatsapp-status-loading">
        <div className="flex items-center gap-2">
          <ShimmerSkeleton className="h-4 w-4 rounded-full" />
          <ShimmerSkeleton className="h-3 w-28 rounded" />
        </div>
        <div className="flex gap-2">
          <ShimmerSkeleton className="h-11 w-11 rounded-full" />
          <ShimmerSkeleton className="h-11 w-11 rounded-full" />
          <ShimmerSkeleton className="h-11 w-11 rounded-full" />
        </div>
      </section>
    );
  }

  if (statusMessages.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card/40 p-3" aria-label="Status do WhatsApp" data-testid="whatsapp-status-section">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-whatsapp" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">Status do WhatsApp</h3>
        {unseenCount > 0 && (
          <span className="ml-auto rounded-full bg-whatsapp/15 px-2 py-0.5 text-xs font-medium text-whatsapp">
            {unseenCount} novo{unseenCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {statusMessages.map((message, index) => (
          <Thumbnail
            key={storyKeyOf(message, index)}
            message={message}
            index={index}
            seen={seen.has(storyKeyOf(message, index))}
            onOpen={setViewerIndex}
          />
        ))}
      </div>

      {viewerIndex !== null && (
        <StoryViewer
          messages={statusMessages}
          initialIndex={viewerIndex}
          instanceName={instanceName}
          onClose={() => setViewerIndex(null)}
          onSeen={markSeen}
        />
      )}
    </section>
  );
}

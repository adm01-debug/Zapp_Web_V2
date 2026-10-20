import { useState } from 'react';
import { useWhatsAppStatus, type WhatsAppStatusMessage } from '@/hooks/integrations/useWhatsAppStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Image as ImageIcon, Video, Type, Clock, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { StoryViewer } from './StoryViewer';

interface WhatsAppStatusSectionProps {
  phone: string;
}

const getStatusIcon = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage) return <ImageIcon className="w-3.5 h-3.5 text-primary" />;
  if (msg.message?.videoMessage) return <Video className="w-3.5 h-3.5 text-accent-foreground" />;
  return <Type className="w-3.5 h-3.5 text-success" />;
};

const getStatusLabel = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.conversation) return msg.message.conversation;
  if (msg.message?.imageMessage) return '📷 Foto';
  if (msg.message?.videoMessage) return '🎥 Vídeo';
  if (msg.status) return `Status: ${msg.status}`;
  return 'Status';
};

const getStatusTime = (msg: WhatsAppStatusMessage) => {
  const ts = msg.messageTimestamp;
  if (!ts) return null;
  const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) * 1000 : ts * 1000);
  return formatRelativeTime(date);
};

export function WhatsAppStatusSection({ phone }: WhatsAppStatusSectionProps) {
  const { statusMessages, presence, loading, error, refresh } = useWhatsAppStatus(phone);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openViewer = (index: number) => { setViewerIndex(index); setViewerOpen(true); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Carregando status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <WifiOff className="w-5 h-5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" />Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="whatsapp-status-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('w-2.5 h-2.5 rounded-full', presence.loading ? 'bg-muted-foreground/30 animate-pulse' : presence.isOnline ? 'bg-success' : 'bg-muted-foreground/40')} />
          <span className="text-xs text-muted-foreground">
            {presence.loading ? 'Verificando...' : presence.isOnline ? <span className="text-success font-medium">Online agora</span> : presence.lastSeen ? `Visto por último ${presence.lastSeen}` : 'Offline'}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-primary/10" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {statusMessages.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center"><Clock className="w-5 h-5 text-muted-foreground/30" /></div>
          <p className="text-xs text-muted-foreground/60">Nenhum status disponível</p>
          <p className="text-3xs text-muted-foreground/40">Os status desaparecem após 24h</p>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => openViewer(0)} className="w-full h-9 text-xs gap-2 border-primary/20 hover:bg-primary/10 hover:border-primary/30">
          <ImageIcon className="w-3.5 h-3.5 text-primary" />Ver Status
          <Badge variant="secondary" className="text-3xs ml-auto px-1.5 py-0 h-4 bg-primary/10 text-primary border-0">{statusMessages.length}</Badge>
        </Button>
      )}

      <StoryViewer messages={statusMessages} initialIndex={viewerIndex} open={viewerOpen} onClose={() => setViewerOpen(false)} pushName={statusMessages[0]?.pushName} />
    </div>
  );
}

import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import {
  X, Download, Play, Pause, FileText, File, FileSpreadsheet,
  FileImage, FileArchive, ExternalLink, Maximize, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFileCategory, formatFileSize, getFileExtension, WHATSAPP_FILE_TYPES } from '@/utils/whatsappFileTypes';
import { VideoFullscreen } from './VideoFullscreen';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

function getFileIcon(fileName: string, mimeType?: string) {
  const extension = getFileExtension(fileName).toLowerCase();
  if (['pdf'].includes(extension)) return <FileText className="w-8 h-8 text-destructive" />;
  if (['doc', 'docx'].includes(extension)) return <FileText className="w-8 h-8 text-info" />;
  if (['xls', 'xlsx'].includes(extension)) return <FileSpreadsheet className="w-8 h-8 text-success" />;
  if (['ppt', 'pptx'].includes(extension)) return <FileText className="w-8 h-8 text-warning" />;
  if (['zip', 'rar', '7z'].includes(extension)) return <FileArchive className="w-8 h-8 text-warning" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return <FileImage className="w-8 h-8 text-primary" />;
  return <File className="w-8 h-8 text-muted-foreground" />;
}

// Document Preview Component
interface DocumentPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  isSent: boolean;
}

export function DocumentPreview({ url, fileName, fileSize, isSent }: DocumentPreviewProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const extension = getFileExtension(fileName).toUpperCase();

  const handleDownload = async () => {
    log.warn('[SECURITY] File download blocked by data protection policy');
    const { toast: toastFn } = await import('sonner');
    toastFn.error('🔒 Download bloqueado por política de segurança', {
      description: 'O download de arquivos está desabilitado para proteção de dados.',
    });
  };

  const handleOpen = () => {
    import('sonner').then(({ toast }) => {
      toast.error('🔒 Abertura externa bloqueada por política de segurança');
    });
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg min-w-[240px] max-w-[300px] cursor-pointer transition-all",
        isSent ? "bg-primary-foreground/10 hover:bg-primary-foreground/15" : "bg-muted/50 hover:bg-muted/70 border border-border/30"
      )}
      onClick={handleOpen}
    >
      <div className={cn("flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center", isSent ? "bg-primary-foreground/20" : "bg-card")}>
        {getFileIcon(fileName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", isSent ? "text-primary-foreground" : "text-foreground")}>{fileName}</p>
        <div className={cn("flex items-center gap-2 text-xs", isSent ? "text-primary-foreground/70" : "text-muted-foreground")}>
          <span className="font-medium">{extension}</span>
          {fileSize && (<><span>•</span><span>{formatFileSize(fileSize)}</span></>)}
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
          isSent ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground" : "bg-primary/10 hover:bg-primary/20 text-primary"
        )}
      >
        {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </motion.button>
    </motion.div>
  );
}

// Video Preview Component
interface VideoPreviewProps { url: string; caption?: string; isSent: boolean; }

export const VideoPreview = forwardRef<HTMLDivElement, VideoPreviewProps>(
  function VideoPreview({ url, caption, isSent }, ref) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const { url: resolvedUrl, isLoading, refresh } = useResolvedStorageUrl(url);

    return (
      <div ref={ref}>
        <div className="space-y-2">
          <motion.div whileHover={{ scale: 1.02 }} className="relative rounded-lg overflow-hidden max-w-[300px] cursor-pointer" onClick={() => setShowFullscreen(true)}>
            {(!isLoaded || isLoading) && (
              <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {resolvedUrl && <video
              key={resolvedUrl}
              src={resolvedUrl} className="w-full max-h-[200px] object-cover rounded-lg" muted={isMuted} loop playsInline
              onLoadedData={() => setIsLoaded(true)}
              onError={() => { setIsLoaded(false); void refresh(); }}
              onMouseEnter={(e) => { e.currentTarget.play(); setIsPlaying(true); }}
              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; setIsPlaying(false); }}
            />}
            <AnimatePresence>
              {!isPlaying && isLoaded && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                    <Play className="w-6 h-6 text-primary ml-0.5" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={(e) => { e.stopPropagation(); setShowFullscreen(true); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-background/50 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/70" aria-label="Tela cheia">
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </motion.div>
          {caption && <p className={cn("text-sm", isSent ? "text-primary-foreground" : "text-foreground")}>{caption}</p>}
        </div>
        <AnimatePresence>
          {showFullscreen && resolvedUrl && <VideoFullscreen url={resolvedUrl} onClose={() => setShowFullscreen(false)} />}
        </AnimatePresence>
      </div>
    );
  }
);

// Sticker Preview
interface StickerPreviewProps { url: string; isSent: boolean; }

export function StickerPreview({ url, isSent }: StickerPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="relative">
      {!isLoaded && <div className="w-[120px] h-[120px] bg-muted animate-pulse rounded-lg" />}
      <motion.img src={url} alt="Sticker" onLoad={() => setIsLoaded(true)} whileHover={{ scale: 1.1 }} className={cn("max-w-[120px] max-h-[120px] object-contain", !isLoaded && "hidden")} />
    </motion.div>
  );
}

// Combined Media Message Component
interface MediaMessageProps { type: 'video' | 'document' | 'sticker'; url: string; fileName?: string; fileSize?: number; caption?: string; isSent: boolean; }

export function MediaMessage({ type, url, fileName, fileSize, caption, isSent }: MediaMessageProps) {
  switch (type) {
    case 'video': return <VideoPreview url={url} caption={caption} isSent={isSent} />;
    case 'document': return <DocumentPreview url={url} fileName={fileName || 'document'} fileSize={fileSize} isSent={isSent} />;
    case 'sticker': return <StickerPreview url={url} isSent={isSent} />;
    default: return null;
  }
}

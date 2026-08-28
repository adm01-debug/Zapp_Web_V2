import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Play, Globe, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isImageUrl, isVideoUrl, isYouTubeUrl, getYouTubeThumbnail,
  getDomain, getFavicon, extractLinks, escapeHtml,
  type LinkMetadata,
} from './linkPreviewUtils';

export { extractLinks };

interface LinkPreviewProps {
  url: string;
  className?: string;
  compact?: boolean;
  showRemove?: boolean;
  onRemove?: () => void;
}

export function LinkPreview({ url, className, compact = false, showRemove, onRemove }: LinkPreviewProps) {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setIsLoading(true); setError(false);
    try {
      if (isImageUrl(url)) { setMetadata({ url, type: 'image', image: url, title: url.split('/').pop() || 'Image' }); setIsLoading(false); return; }
      if (isVideoUrl(url)) { setMetadata({ url, type: 'video', title: url.split('/').pop() || 'Video' }); setIsLoading(false); return; }
      if (isYouTubeUrl(url)) { setMetadata({ url, type: 'video', title: 'YouTube Video', image: getYouTubeThumbnail(url) || undefined, siteName: 'YouTube', favicon: 'https://www.youtube.com/favicon.ico' }); setIsLoading(false); return; }
      setMetadata({ url, type: 'website', title: getDomain(url), siteName: getDomain(url), favicon: getFavicon(url) });
      setIsLoading(false);
    } catch { setError(true); setIsLoading(false); }
  }, [url]);

  if (isLoading) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/50", className)}>
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Carregando preview...</span>
    </motion.div>
  );

  if (error || !metadata) return (
    <motion.a href={url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-primary underline-offset-2 hover:underline", className)}>
      <Globe className="w-4 h-4 shrink-0" /><span className="truncate">{url}</span><ExternalLink className="w-3 h-3 shrink-0" />
    </motion.a>
  );

  if (metadata.type === 'image' && metadata.image && !imageError) return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={cn("relative group rounded-xl overflow-hidden", className)}>
      {showRemove && <button onClick={onRemove} className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/50 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/70"><X className="w-4 h-4" /></button>}
      <a href={url} target="_blank" rel="noopener noreferrer"><img src={metadata.image} alt={metadata.title || 'Image'} onError={() => setImageError(true)} className="max-w-full max-h-64 rounded-xl object-cover hover:scale-[1.02] transition-transform" /></a>
    </motion.div>
  );

  if (compact) return (
    <motion.a href={url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
      className={cn("flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors group", className)}>
      {metadata.favicon && !imageError ? <img src={metadata.favicon} alt="" className="w-4 h-4 rounded" onError={() => setImageError(true)} /> : <Globe className="w-4 h-4 text-muted-foreground" />}
      <span className="text-sm font-medium truncate flex-1">{metadata.title || getDomain(url)}</span>
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
    </motion.a>
  );

  return (
    <motion.a href={url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={cn("block rounded-xl overflow-hidden border border-border/50 bg-card hover:border-primary/30 transition-all group", className)}>
      {metadata.image && !imageError && (
        <div className="relative aspect-video bg-muted overflow-hidden">
          <img src={metadata.image} alt={metadata.title || ''} onError={() => setImageError(true)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          {metadata.type === 'video' && <div className="absolute inset-0 flex items-center justify-center bg-background/30"><div className="p-3 rounded-full bg-background/90 group-hover:scale-110 transition-transform"><Play className="w-6 h-6 text-foreground fill-black" /></div></div>}
        </div>
      )}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          {metadata.favicon && !imageError ? <img src={metadata.favicon} alt="" className="w-4 h-4 rounded" onError={() => setImageError(true)} /> : <Globe className="w-4 h-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground truncate">{metadata.siteName || getDomain(url)}</span>
        </div>
        {metadata.title && <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{metadata.title}</h4>}
        {metadata.description && <p className="text-xs text-muted-foreground line-clamp-2">{metadata.description}</p>}
      </div>
      {showRemove && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove?.(); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-background/50 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/70"><X className="w-4 h-4" /></button>}
    </motion.a>
  );
}

interface TextWithLinksProps { text: string; className?: string; showPreviews?: boolean; maxPreviews?: number; }

export function TextWithLinks({ text, className, showPreviews = true, maxPreviews = 3 }: TextWithLinksProps) {
  const links = useMemo(() => extractLinks(text), [text]);
  const displayLinks = links.slice(0, maxPreviews);
  const formattedText = useMemo(() => {
    let result = escapeHtml(text);
    links.forEach(link => { const escaped = escapeHtml(link); result = result.replace(escaped, `<a href="${encodeURI(link)}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:text-primary/80">${escaped}</a>`); });
    return result;
  }, [text, links]);

  return (
    <div className={cn("space-y-2", className)}>
      <div dangerouslySetInnerHTML={{ __html: formattedText }} />
      {showPreviews && displayLinks.length > 0 && (
        <AnimatePresence><div className="space-y-2 pt-2">{displayLinks.map((link, i) => (
          <motion.div key={link} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <LinkPreview url={link} compact={displayLinks.length > 1} />
          </motion.div>
        ))}</div></AnimatePresence>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import { Link2 } from 'lucide-react';

interface LinkPreviewData {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  site_name?: string;
}

interface LinkPreviewCardProps {
  preview: unknown;
  isSent: boolean;
}

function parsePreview(raw: unknown): LinkPreviewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const url = typeof p.url === 'string' ? p.url : undefined;
  const title = typeof p.title === 'string' ? p.title : undefined;
  const description = typeof p.description === 'string' ? p.description : undefined;
  const image = typeof p.image === 'string' ? p.image : undefined;
  const siteName =
    typeof p.siteName === 'string'
      ? p.siteName
      : typeof p.site_name === 'string'
        ? p.site_name
        : undefined;
  if (!url && !title && !description && !image) return null;
  return { url, title, description, image, siteName };
}

export function LinkPreviewCard({ preview, isSent }: LinkPreviewCardProps) {
  const data = parsePreview(preview);
  if (!data) return null;

  const host = (() => {
    if (!data.url) return data.siteName;
    try {
      return new URL(data.url).hostname.replace(/^www\./, '');
    } catch {
      return data.siteName;
    }
  })();

  const content = (
    <div
      className={cn(
        'mb-1.5 -mx-1 overflow-hidden rounded-lg border-l-4 transition-colors',
        isSent
          ? 'bg-primary-foreground/10 border-primary-foreground/40 hover:bg-primary-foreground/15'
          : 'bg-muted/40 border-primary/50 hover:bg-muted/60',
      )}
    >
      {data.image && (
        <div className="w-full aspect-[1.91/1] overflow-hidden bg-muted">
          <img
            src={data.image}
            alt={data.title || 'Link preview'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="px-2.5 py-2 space-y-0.5">
        {host && (
          <div
            className={cn(
              'flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium',
              isSent ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            <Link2 className="w-2.5 h-2.5" />
            <span className="truncate">{host}</span>
          </div>
        )}
        {data.title && (
          <p
            className={cn(
              'text-[12.5px] font-semibold leading-snug line-clamp-2',
              isSent ? 'text-primary-foreground' : 'text-foreground',
            )}
          >
            {data.title}
          </p>
        )}
        {data.description && (
          <p
            className={cn(
              'text-[11.5px] leading-snug line-clamp-2',
              isSent ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {data.description}
          </p>
        )}
      </div>
    </div>
  );

  if (!data.url) return content;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block"
      aria-label={data.title ? `Abrir link: ${data.title}` : 'Abrir link'}
    >
      {content}
    </a>
  );
}
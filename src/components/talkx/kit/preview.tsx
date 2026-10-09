import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/** Bolha de preview estilo WhatsApp (mensagem enviada). */
export function WhatsAppBubble({ text, mediaUrl, mediaType, time, senderName = 'Sua Empresa', className }: { text: string; mediaUrl?: string | null; mediaType?: string | null; time?: string; senderName?: string; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-[hsl(240_5%_7%)] overflow-hidden', className)}>
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/50 bg-card">
        <div className="w-8 h-8 rounded-full bg-whatsapp/20 flex items-center justify-center text-2xs font-bold text-whatsapp">{senderName.slice(0, 1)}</div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{senderName}</p>
          <p className="text-3xs text-whatsapp">online</p>
        </div>
      </div>
      <div className="p-3 bg-[radial-gradient(hsl(var(--primary)/.06)_1px,transparent_1px)] [background-size:14px_14px]">
        <div className="flex justify-center mb-2"><span className="text-3xs px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">Hoje</span></div>
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">
            {mediaUrl && mediaType === 'image' && /^https?:\/\//i.test(mediaUrl) && <img src={mediaUrl} alt="" className="rounded-lg mb-2 max-h-40 w-full object-cover" loading="lazy" decoding="async" />}
            {mediaUrl && mediaType && mediaType !== 'image' && (
              <div className="rounded-lg mb-2 px-2.5 py-2 bg-black/20 text-2xs text-muted-foreground">📎 {mediaType} anexado</div>
            )}
            {text || (mediaUrl ? null : <span className="text-muted-foreground italic">Digite uma mensagem…</span>)}
            <span className="block text-right text-3xs text-muted-foreground mt-1">{time ?? format(new Date(), 'HH:mm')} ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Moldura de telefone WhatsApp para preview de template (E44). */
export function PhoneFrame({ text, mediaUrl, mediaType, senderName = 'Sua Empresa' }: { text: string; mediaUrl?: string | null; mediaType?: string | null; senderName?: string }) {
  const now = format(new Date(), 'HH:mm');
  const initials = senderName.slice(0, 1).toUpperCase();
  return (
    <div className="mx-auto flex-shrink-0" style={{ width: 272, height: 540 }}>
      <div className="relative w-full h-full rounded-[36px] border-[7px] border-[hsl(220_10%_14%)] bg-[hsl(220_10%_11%)] shadow-2xl overflow-hidden">
        {/* notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[hsl(220_10%_14%)] z-10" />
        {/* status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-[hsl(220_8%_8%)]">
          <span className="text-[9px] font-bold text-white">{now}</span>
          <span className="text-3xs text-white/60">&#9679;&#9679;&#9679;&#9679; WiFi</span>
        </div>
        {/* WA header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[hsl(151_52%_21%)]">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{initials}</div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-white leading-tight truncate">{senderName}</p>
            <p className="text-3xs text-white/70">online</p>
          </div>
        </div>
        {/* chat area */}
        <div
          className="p-2 overflow-hidden"
          style={{
            height: 'calc(100% - 72px)',
            background: 'hsl(var(--background))',
            backgroundImage: 'radial-gradient(hsl(var(--primary)/.05) 1px, transparent 1px)',
            backgroundSize: '11px 11px',
          }}
        >
          <div className="flex justify-center mb-1.5">
            <span className="text-3xs px-1.5 py-0.5 rounded bg-black/20 text-white/50">Hoje</span>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[86%] rounded-xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-2 py-1.5 text-[9px] text-foreground whitespace-pre-wrap leading-snug break-words">
              {mediaUrl && mediaType === 'image' && (
                /^https?:\/\//i.test(mediaUrl) && <img src={mediaUrl} alt="" className="rounded mb-1 w-full object-cover" style={{ maxHeight: 64 }} loading="lazy" />
              )}
              {mediaUrl && mediaType && mediaType !== 'image' && (
                <div className="rounded mb-1 px-1.5 py-0.5 bg-black/20 text-3xs text-muted-foreground">📎 {mediaType}</div>
              )}
              {text || <span className="text-muted-foreground italic">Prévia da mensagem…</span>}
              <span className="block text-right text-3xs text-muted-foreground mt-0.5">{now} ✓✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

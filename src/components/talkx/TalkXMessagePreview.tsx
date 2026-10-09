import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, Maximize2, Mic, MoreVertical, Paperclip, Phone, Play, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTalkXMediaUrl } from '@/hooks/integrations/useTalkXMediaUrl';
import { cn } from '@/lib/utils';
import { personalizePreview, type PreviewContact } from './kit/personalize';

/**
 * X088 (V28/V61) — prévia de mensagem fiel ao WhatsApp.
 *
 * Antes desta etapa a prévia era a `WhatsAppBubble`/`PhoneFrame` de `kit/preview`:
 * `*negrito*` e `_itálico_` saíam crus, vídeo/documento/áudio saíam como
 * "📎 tipo", a imagem ficava dentro da MESMA bolha do texto e não havia tela
 * cheia. Aqui ficam os dois usos — bolha (cartão) e moldura (editor) — no MESMO
 * renderizador, para a mensagem aparecer igual nos dois lugares. `WhatsAppBubble`
 * e `PhoneFrame` continuam exportados (reexport em `kit/preview`) para o wizard e
 * a tela Agendada não mudarem de import.
 *
 * Regras desta prévia:
 *   - formatação do WhatsApp: `*negrito*`, `_itálico_`, `~tachado~`, listas com
 *     `- ` ou `• ` e link (http/https/www) — nada de HTML do usuário;
 *   - modo `raw`: as variáveis saem cruas (`{{nome}}`) destacadas;
 *     modo `resolved`: o valor resolvido sai em negrito, pela MESMA função da
 *     prévia do wizard (`personalizePreview`, gramática de `kit/placeholders`);
 *   - mídia por tipo: imagem vira bolha própria (proporção do arquivo, hora e
 *     ✓✓), vídeo com quadro e ícone, documento com nome e tamanho, áudio com
 *     barra. O texto NÃO acompanha o áudio — é o que o envio faz
 *     (`supabase/functions/talkx-send`: áudio sai como `{ audio }`, sem caption);
 *   - cores só por token do sistema (nenhuma cor literal) e nenhum selo de canal.
 *
 * A URL da mídia vem do hook `useTalkXMediaUrl` (X088/CAP-059), em
 * `src/hooks/integrations` — componente não fala com o client do Supabase.
 */

export type TalkXPreviewMode = 'raw' | 'resolved';

export type TalkXPreviewInteractive = {
  buttons?: string[];
  poll?: { question: string; options?: string[] };
};

export interface TalkXMessagePreviewProps {
  /** Texto da mensagem, com `{{variavel}}`, formatação do WhatsApp e listas. */
  text: string;
  /** `raw` = variáveis cruas destacadas; `resolved` = valor resolvido em negrito. */
  mode?: TalkXPreviewMode;
  /** Contato de amostra do modo `resolved` (padrão da prévia do wizard). */
  contact?: PreviewContact | null;
  /** Valores das variáveis próprias do template. */
  customValues?: Record<string, string>;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaFileName?: string | null;
  mediaSizeBytes?: number | null;
  /** Botões e enquete do WhatsApp (`interactive`). */
  interactive?: TalkXPreviewInteractive | null;
  /** Hora da mensagem; sem ela, a hora atual. */
  time?: string;
  senderName?: string;
  className?: string;
}

type RenderContext = {
  mode: TalkXPreviewMode;
  contact?: PreviewContact | null;
  customValues?: Record<string, string>;
};

const VARIABLE_TOKEN = /^\{\{[^}]+\}\}$/;
const VARIABLE_SPLIT = /(\{\{[^}]+\}\})/g;
/** Delimitadores do WhatsApp (grupo de captura: o `split` preserva o token). */
const INLINE_MARKUP = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|(?:https?:\/\/|www\.)[^\s]+)/g;
const BULLET_LINE = /^\s*[-•]\s+(.*)$/;

function renderVariable(raw: string, key: string, ctx: RenderContext): React.ReactNode {
  if (ctx.mode === 'raw') {
    return (
      <span key={key} data-testid="talkx-preview-variable" className="rounded bg-primary/10 px-0.5 text-primary-glow">
        {raw}
      </span>
    );
  }
  // `personalizePreview` resolve o token inteiro com a MESMA regra do envio
  // (inclusive `{{var|padrão}}` e variável sem valor → `[var]`).
  const value = personalizePreview(raw, ctx.contact, ctx.customValues ?? {});
  return (
    <strong key={key} data-testid="talkx-preview-variable-value" className="font-semibold">
      {value}
    </strong>
  );
}

/** Um trecho sem variáveis: formatação + link do WhatsApp. */
function renderInline(part: string, key: string): React.ReactNode {
  if (/^\*[^*\n]+\*$/.test(part)) return <strong key={key} className="font-semibold">{part.slice(1, -1)}</strong>;
  if (/^_[^_\n]+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
  if (/^~[^~\n]+~$/.test(part)) return <s key={key}>{part.slice(1, -1)}</s>;
  const href = /^www\./i.test(part) ? `https://${part}` : part;
  if (/^https?:\/\//i.test(href)) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-primary-glow underline break-all">
        {part}
      </a>
    );
  }
  return <React.Fragment key={key}>{part}</React.Fragment>;
}

function renderTextRun(run: string, keyPrefix: string): React.ReactNode[] {
  return run
    .split(INLINE_MARKUP)
    .map((part, index) => (part === '' ? null : renderInline(part, `${keyPrefix}-${index}`)))
    .filter((node) => node !== null);
}

/** Uma linha: variáveis e formatação no lugar certo, na ordem do texto. */
function renderLine(line: string, keyPrefix: string, ctx: RenderContext): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  line.split(VARIABLE_SPLIT).forEach((piece, index) => {
    if (piece === '') return;
    if (VARIABLE_TOKEN.test(piece)) {
      nodes.push(renderVariable(piece, `${keyPrefix}-v${index}`, ctx));
      return;
    }
    nodes.push(...renderTextRun(piece, `${keyPrefix}-t${index}`));
  });
  return nodes;
}

/** Corpo da mensagem: parágrafos e listas com marcador (`- item`). */
function renderMessageBody(text: string, ctx: RenderContext): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    const key = `ul-${blocks.length}`;
    blocks.push(
      <ul key={key} className="list-disc pl-4 space-y-0.5">
        {items.map((item, index) => (
          <li key={`${key}-${index}`}>{renderLine(item, `${key}-${index}`, ctx)}</li>
        ))}
      </ul>,
    );
  };
  text.split('\n').forEach((line, index) => {
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush();
    blocks.push(<p key={`p-${index}`}>{renderLine(line, `p-${index}`, ctx)}</p>);
  });
  flush();
  return blocks;
}

type MediaKind = 'image' | 'video' | 'document' | 'audio' | 'file';

function mediaKindOf(mediaType?: string | null): MediaKind {
  const type = (mediaType ?? '').toLowerCase();
  if (['image', 'photo', 'imagem', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(type)) return 'image';
  if (['video', 'mp4', 'mov', 'webm'].includes(type)) return 'video';
  if (['audio', 'ptt', 'voz', 'ogg', 'opus', 'mp3', 'm4a', 'wav'].includes(type)) return 'audio';
  if (type !== '') return 'document';
  return 'file';
}

/** "1,2 MB" — sem tamanho informado, nada é mostrado. */
function formatBytes(bytes?: number | null): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function PreviewMedia({ kind, url, fileName, sizeBytes }: { kind: MediaKind; url?: string | null; fileName?: string | null; sizeBytes?: number | null }) {
  const resolved = useTalkXMediaUrl(url);
  const size = formatBytes(sizeBytes);

  if (kind === 'image') {
    // Proporção do próprio arquivo (`w-full h-auto`), não um recorte fixo.
    if (!resolved) return null;
    return (
      <img
        data-testid="talkx-preview-image"
        src={resolved}
        alt={fileName ?? ''}
        className="rounded-lg w-full h-auto object-cover"
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (kind === 'video') {
    return (
      <div data-testid="talkx-preview-video" className="relative rounded-lg overflow-hidden bg-foreground/10 aspect-video flex items-center justify-center">
        <Play className="w-6 h-6 text-foreground-secondary" />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div data-testid="talkx-preview-audio" className="space-y-1">
        <div className="flex items-center gap-2">
          <Mic className="w-3.5 h-3.5 shrink-0 text-foreground-secondary" />
          <span className="flex-1 h-1.5 rounded-full bg-foreground/15 overflow-hidden">
            <span className="block h-full w-1/3 rounded-full bg-whatsapp" />
          </span>
          <span className="text-3xs tabular-nums text-muted-foreground">0:12</span>
        </div>
        <p className="text-3xs text-muted-foreground">O texto não acompanha o áudio — o envio manda só o arquivo.</p>
      </div>
    );
  }

  return (
    <div data-testid="talkx-preview-document" className="flex items-center gap-2 rounded-lg bg-foreground/5 px-2 py-1.5">
      <Paperclip className="w-3.5 h-3.5 shrink-0 text-foreground-secondary" />
      <span className="min-w-0">
        <span className="block truncate">{fileName ?? `Arquivo ${kind === 'file' ? '' : kind}`.trim()}</span>
        {size && <span className="block text-3xs text-muted-foreground">{size}</span>}
      </span>
    </div>
  );
}

/** Botões e enquete do `interactive` — como o cliente vê no WhatsApp. */
function PreviewInteractive({ interactive }: { interactive?: TalkXPreviewInteractive | null }) {
  const buttons = interactive?.buttons ?? [];
  const poll = interactive?.poll ?? null;
  const options = poll?.options ?? [];
  if (buttons.length === 0 && !poll) return null;

  return (
    <div className="mt-1 space-y-1" data-testid="talkx-preview-interactive">
      {poll && (
        <div data-testid="talkx-preview-poll" className="rounded-xl border border-border/60 bg-card px-2 py-1.5">
          <p className="font-semibold">{poll.question}</p>
          <ul className="mt-1 space-y-0.5">
            {options.map((option, index) => (
              <li key={index} data-testid="talkx-preview-poll-option" className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 shrink-0 rounded-full border border-primary/50" />
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
      {buttons.map((button, index) => (
        <button
          key={index}
          type="button"
          data-testid="talkx-preview-button"
          className="w-full rounded-xl border border-border/60 bg-card px-2 py-1 font-medium text-primary-glow motion-safe:transition-colors hover:bg-muted/40"
        >
          {button}
        </button>
      ))}
    </div>
  );
}

/** Moldura do celular (tema claro por tokens) — usada na coluna e na tela cheia. */
function FrameBody({
  width,
  height,
  radius,
  senderName,
  clock,
  context,
  text,
  textSize,
  mediaUrl,
  mediaType,
  mediaFileName,
  mediaSizeBytes,
  interactive,
}: {
  width: number;
  height: number;
  radius: number;
  senderName: string;
  clock: string;
  context: RenderContext;
  text: string;
  textSize: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaFileName?: string | null;
  mediaSizeBytes?: number | null;
  interactive?: TalkXPreviewInteractive | null;
}) {
  const kind = mediaKindOf(mediaType);
  const initials = senderName.slice(0, 1).toUpperCase();
  const hasImage = Boolean(mediaUrl) && kind === 'image';
  const hasOtherMedia = Boolean(mediaUrl) && kind !== 'image';
  const empty = !text && !mediaUrl;

  return (
    <div
      className="flex flex-col rounded-[36px] border-[7px] border-border bg-card shadow-2xl overflow-hidden"
      style={{ width, height, borderRadius: radius }}
    >
      <div className="flex items-center justify-between px-4 py-1 bg-muted/40 shrink-0">
        <span className="text-[9px] font-bold text-foreground tabular-nums">{clock}</span>
        <span className="text-3xs text-foreground-secondary">●●●● WiFi</span>
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-whatsapp/15 border-b border-whatsapp/25 shrink-0">
        <ChevronLeft className="w-3 h-3 shrink-0 text-foreground-secondary" />
        <span className="w-6 h-6 rounded-full bg-whatsapp/25 flex items-center justify-center text-[9px] font-bold text-foreground shrink-0">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold text-foreground leading-tight truncate">{senderName}</span>
          <span className="block text-3xs text-whatsapp">Online</span>
        </span>
        <Video className="w-3 h-3 shrink-0 text-foreground-secondary" />
        <Phone className="w-3 h-3 shrink-0 text-foreground-secondary" />
        <MoreVertical className="w-3 h-3 shrink-0 text-foreground-secondary" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-2 bg-muted/30">
        <div className="flex justify-center mb-1.5">
          <span className="text-3xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Hoje</span>
        </div>
        {hasImage && (
          <div data-testid="talkx-preview-media-bubble" className="flex justify-end mb-1">
            <div className="max-w-[86%] rounded-xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 p-1">
              <PreviewMedia kind="image" url={mediaUrl} fileName={mediaFileName} sizeBytes={mediaSizeBytes} />
              <span className="block text-right text-3xs text-white/70 mt-0.5">{clock} ✓✓</span>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <div className={cn('max-w-[86%] rounded-xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-2 py-1.5 text-white leading-snug break-words whitespace-pre-wrap', textSize)}>
            {hasOtherMedia && <PreviewMedia kind={kind} url={mediaUrl} fileName={mediaFileName} sizeBytes={mediaSizeBytes} />}
            {text ? (
              renderMessageBody(text, context)
            ) : empty ? (
              <span className="text-white/70 italic">Prévia da mensagem…</span>
            ) : null}
            <span className="block text-right text-3xs text-white/70 mt-0.5">{clock} ✓✓</span>
          </div>
        </div>
        <PreviewInteractive interactive={interactive} />
      </div>
    </div>
  );
}

/** Uso 1 — bolha do cartão (galeria, wizard, tela Agendada). */
export function WhatsAppBubble({
  text,
  mode = 'resolved',
  contact,
  customValues,
  mediaUrl,
  mediaType,
  mediaFileName,
  mediaSizeBytes,
  interactive,
  time,
  senderName = 'Sua Empresa',
  className,
}: TalkXMessagePreviewProps) {
  const kind = mediaKindOf(mediaType);
  const clock = time ?? format(new Date(), 'HH:mm');
  const context: RenderContext = { mode, contact, customValues };
  const hasImage = Boolean(mediaUrl) && kind === 'image';
  const hasOtherMedia = Boolean(mediaUrl) && kind !== 'image';
  const empty = !text && !mediaUrl;

  return (
    <div
      data-testid="talkx-preview"
      data-variant="bubble"
      data-mode={mode}
      className={cn('rounded-2xl border border-border/60 bg-card overflow-hidden', className)}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className="w-8 h-8 rounded-full bg-whatsapp/20 flex items-center justify-center text-2xs font-bold text-success">
          {senderName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{senderName}</p>
          <p className="text-3xs text-success">online</p>
        </div>
      </div>
      <div className="p-3 bg-muted/20">
        <div className="flex justify-center mb-2">
          <span className="text-3xs px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">Hoje</span>
        </div>
        {hasImage && (
          <div data-testid="talkx-preview-media-bubble" className="flex justify-end mb-1">
            <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 p-1.5">
              <PreviewMedia kind="image" url={mediaUrl} fileName={mediaFileName} sizeBytes={mediaSizeBytes} />
              <span className="block text-right text-3xs text-white/70 mt-1">{clock} ✓✓</span>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-[13px] text-white leading-relaxed whitespace-pre-wrap">
            {hasOtherMedia && <PreviewMedia kind={kind} url={mediaUrl} fileName={mediaFileName} sizeBytes={mediaSizeBytes} />}
            {text ? (
              renderMessageBody(text, context)
            ) : empty ? (
              <span className="text-white/70 italic">Digite uma mensagem…</span>
            ) : null}
            <span className="block text-right text-3xs text-white/70 mt-1">{clock} ✓✓</span>
          </div>
        </div>
        <PreviewInteractive interactive={interactive} />
      </div>
    </div>
  );
}

/** Uso 2 — moldura do celular no editor, com "Ver em tela cheia". */
export function PhoneFrame({
  text,
  mode = 'resolved',
  contact,
  customValues,
  mediaUrl,
  mediaType,
  mediaFileName,
  mediaSizeBytes,
  interactive,
  time,
  senderName = 'Sua Empresa',
  className,
  allowFullscreen = true,
}: TalkXMessagePreviewProps & { allowFullscreen?: boolean }) {
  const [open, setOpen] = useState(false);
  const clock = time ?? format(new Date(), 'HH:mm');
  const context: RenderContext = { mode, contact, customValues };
  const frameProps = { senderName, clock, context, text, mediaUrl, mediaType, mediaFileName, mediaSizeBytes, interactive };

  return (
    <div data-testid="talkx-preview" data-variant="frame" data-mode={mode} className={cn('mx-auto flex flex-col items-center gap-2 flex-shrink-0', className)}>
      <FrameBody {...frameProps} width={272} height={540} radius={36} textSize="text-[9px]" />
      {allowFullscreen && (
        <button
          type="button"
          data-testid="talkx-preview-fullscreen"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-2xs font-medium border border-border/60 bg-input/40 text-foreground-secondary hover:bg-muted/50 motion-safe:transition-colors"
        >
          <Maximize2 className="w-3 h-3" /> Ver em tela cheia
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-none w-auto bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Prévia da mensagem em tela cheia</DialogTitle>
          <div data-testid="talkx-preview-fullscreen-content">
            <FrameBody {...frameProps} width={320} height={640} radius={40} textSize="text-[11px]" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Componente único desta etapa: `variant="bubble"` (cartão) ou `variant="frame"`
 * (editor). Os dois nomes antigos continuam válidos como reexport.
 */
export function TalkXMessagePreview({ variant = 'bubble', ...props }: TalkXMessagePreviewProps & { variant?: 'bubble' | 'frame' }) {
  return variant === 'frame' ? <PhoneFrame {...props} /> : <WhatsAppBubble {...props} />;
}

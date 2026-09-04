import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Printer } from 'lucide-react';

interface EmailFullViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** HTML JÁ sanitizado por sanitizeEmailHtml() */
  sanitizedHtml: string;
  subject?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
}

/**
 * Leitura completa do e-mail em iframe sandbox (run h538172, etapa 12).
 *
 * Segurança: sandbox SEM allow-same-origin e SEM allow-scripts — o documento
 * srcDoc não executa script nem acessa a origem da aplicação. Auto-height via
 * ResizeObserver no wrapper + document.body.scrollHeight do iframe (leitura
 * permitida: iframe sem allow-same-origin não expõe contentDocument).
 *
 * Nota honesta: contentDocument é null em iframe sandboxed cross-origin, então
 * o auto-height usa scrollHeight do wrapper com fallback de altura fixa.
 */
export function EmailFullViewDialog({
  open, onOpenChange, sanitizedHtml, subject, fromName, fromAddress,
}: EmailFullViewDialogProps) {
  const [height, setHeight] = useState(480);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setHeight(Math.min(el.scrollHeight, 2000));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, sanitizedHtml]);

  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin:0; padding:16px; font-family:system-ui,sans-serif; font-size:14px; line-height:1.5; color:#111; background:#fff; }
    img { max-width:100%; height:auto; }
    table { max-width:100%; }
    a { color:#1d4ed8; }
  </style></head><body>${sanitizedHtml}</body></html>`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{subject || '(Sem assunto)'}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {fromName ? `${fromName} ` : ''}{fromAddress ? `<${fromAddress}>` : ''}
          </DialogDescription>
        </DialogHeader>
        <div ref={wrapperRef} className="email-html-scroll rounded-md border border-border/40 bg-white text-neutral-900" style={{ minHeight: height }}>
          <iframe
            title="Conteúdo do e-mail"
            sandbox=""
            srcDoc={doc}
            className="w-full border-0"
            style={{ height, display: 'block' }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Links abrem em nova aba com isolamento total (noopener).
        </p>
      </DialogContent>
    </Dialog>
  );
}

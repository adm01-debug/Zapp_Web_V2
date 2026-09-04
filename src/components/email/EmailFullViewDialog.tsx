import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ExternalLink, Download } from 'lucide-react';

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
 * srcDoc não executa script nem acessa a origem da aplicação (origem opaca).
 *
 * Altura: contentDocument é INACESSÍVEL em iframe sandboxed (origem opaca),
 * então NÃO há auto-height real — a altura é fixa com scroll interno no
 * wrapper. Isso é uma limitação assumida e documentada, não um bug.
 */
export function EmailFullViewDialog({
  open, onOpenChange, sanitizedHtml, subject, fromName, fromAddress,
}: EmailFullViewDialogProps) {
  const [height] = useState(480); // fixa: sem auto-height (contentDocument inacessível no sandbox)

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
        <div className="email-html-scroll rounded-md border border-border/40 bg-white text-neutral-900 overflow-y-auto" style={{ minHeight: height, maxHeight: '70vh' }}>
          <iframe
            title="Conteúdo do e-mail"
            sandbox=""
            srcDoc={doc}
            className="w-full border-0"
            style={{ height, display: 'block' }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <a
            href={`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`}
            download="email.html"
            className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="w-3.5 h-3.5" /> Baixar e-mail (HTML)
          </a>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Links abrem em nova aba com isolamento total (noopener).
        </p>
      </DialogContent>
    </Dialog>
  );
}

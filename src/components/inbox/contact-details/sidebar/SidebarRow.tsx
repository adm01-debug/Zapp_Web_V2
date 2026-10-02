import { type ReactNode } from 'react';
import { Copy, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isSafeHttpUrl } from '@/lib/urlSafety';
import { cn } from '@/lib/utils';

interface SidebarRowProps {
  icon: ReactNode;
  label: string;
  /** sufixo do data-testid: `sidebar-row-<field>` */
  field: string;
  value?: string | null;
  /** conteúdo rico no lugar de `value` (logo, selo verificado, idade) */
  valueNode?: ReactNode;
  /** botão copiar com `copyValue ?? value` quando houver texto */
  copyable?: boolean;
  copyValue?: string | null;
  /** botão external quando `href` passa no guard http(s)/mailto */
  href?: string | null;
  /** marcador "Dado local do Zapp" no rótulo (fonte de fallback) */
  local?: boolean;
  /** vazio + onAdd ⇒ valor vira link "Adicionar" (abre o editor) */
  onAdd?: () => void;
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  } catch {
    toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
  }
}

/** `mailto:` é montado pelo próprio Zapp a partir do campo e-mail — seguro. */
function isSafeHref(href: string | null | undefined): href is string {
  if (!href) return false;
  if (href.startsWith('mailto:')) return true;
  return isSafeHttpUrl(href);
}

/**
 * Linha padrão das seções do sidebar: ícone 16px, rótulo 120px, valor
 * truncado (title com o completo) e até 2 ações à direita (copiar +
 * external). Vazio mostra "—" sem botão — nunca inventa dado.
 */
export function SidebarRow({ icon, label, field, value, valueNode, copyable, copyValue, href, local, onAdd }: SidebarRowProps) {
  const text = value?.trim() ? value : null;
  const hasValue = text !== null || (valueNode !== undefined && valueNode !== null);
  const copy = copyable ? (copyValue ?? text) : null;
  const canCopy = hasValue && copy !== null && copy !== '';
  const safeHref = hasValue && isSafeHref(href) ? href : null;

  return (
    <div data-testid={`sidebar-row-${field}`} className="grid grid-cols-[16px_120px_minmax(0,1fr)_auto] items-center gap-2 min-h-7">
      <span className="w-4 h-4 flex items-center justify-center text-muted-foreground [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <span className="text-xs text-muted-foreground truncate flex items-center gap-1 min-w-0">
        {label}
        {local && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground shrink-0" aria-label="Dado local do Zapp" />
              </TooltipTrigger>
              <TooltipContent>Dado local do Zapp</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      <span className={cn('text-xs truncate', text || valueNode ? 'text-foreground' : 'text-muted-foreground')} title={text ?? undefined}>
        {valueNode ?? (text ?? (onAdd ? (
          <button type="button" onClick={onAdd} className="text-primary hover:underline text-xs" data-testid={`sidebar-add-${field}`}>
            Adicionar
          </button>
        ) : '—'))}
      </span>
      <span className="flex items-center">
        {canCopy && (
          <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground" aria-label={`Copiar ${label}`} onClick={() => copyToClipboard(copy, label)}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        )}
        {safeHref && (
          <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground" asChild>
            <a href={safeHref} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label}`}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
      </span>
    </div>
  );
}

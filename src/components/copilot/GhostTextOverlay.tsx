/**
 * CV-061 — GhostTextOverlay
 *
 * Renderiza o texto fantasma em cinza dentro da caixa de digitação, logo após
 * o cursor, para simular o autocompletar estilo IDE.
 *
 * Técnica:
 *   - Um <div> com `aria-hidden` é posicionado absolutamente sobre o textarea,
 *     compartilhando o mesmo padding/font.
 *   - A parte já digitada é renderizada em `color: transparent` (invisível) e o
 *     sufixo fantasma em `text-muted-foreground` (cinza).
 *   - O textarea fica z-index maior e com background transparente para que o
 *     texto real do usuário sobreponha a camada fantasma sem conflito.
 *
 * Nota de acessibilidade: o overlay é `aria-hidden` e não intercepta foco.
 *   A dica de teclado (Tab / Esc) é comunicada por um tooltip externo.
 */
import { cn } from '@/lib/utils';

interface GhostTextOverlayProps {
  /** Texto já digitado pelo vendedor (idêntico ao `value` do textarea). */
  inputValue: string;
  /** Sufixo sugerido pelo RADAR (o "fantasma"). */
  ghostSuffix: string;
  /** Classes CSS adicionais para a camada fantasma. */
  className?: string;
  /** Se true, o overlay fica invisível (sugestão desabilitada ou vazia). */
  hidden?: boolean;
}

/**
 * Overlay que simula ghost text dentro da caixa de digitação.
 * Deve ser filho do mesmo container relativo que envolve o textarea.
 */
export function GhostTextOverlay({
  inputValue,
  ghostSuffix,
  className,
  hidden = false,
}: GhostTextOverlayProps) {
  if (hidden || !ghostSuffix) return null;

  return (
    <div
      aria-hidden="true"
      // Mesmo posicionamento do textarea: inset-0 + padding correspondente.
      className={cn(
        'pointer-events-none select-none absolute inset-0',
        'text-sm whitespace-pre-wrap break-words overflow-hidden',
        // Mesma fonte e altura de linha do textarea.
        'font-sans leading-relaxed',
        className,
      )}
      style={{
        // Padding exato do textarea (py-3.5 = 14px, px implícito 0 no side).
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '0px',
        paddingRight: '0px',
      }}
    >
      {/* Parte já digitada: transparente — sobreposta pelo texto real do textarea */}
      <span style={{ color: 'transparent' }}>{inputValue}</span>
      {/* Sufixo fantasma: cinza */}
      <span className="text-muted-foreground/60">{ghostSuffix}</span>
    </div>
  );
}

/**
 * Badge compacto que lembra o atalho de teclado Tab / Esc.
 * Aparece somente quando há ghost text ativo.
 */
interface GhostTextHintProps {
  visible: boolean;
  className?: string;
}

export function GhostTextHint({ visible, className }: GhostTextHintProps) {
  if (!visible) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-3xs text-muted-foreground/60 select-none',
        className,
      )}
      aria-label="Tab para aceitar, Esc para descartar"
    >
      <kbd className="rounded border border-border/50 px-1 py-0 font-mono text-3xs leading-4">
        Tab
      </kbd>
      <span>aceitar</span>
      <kbd className="rounded border border-border/50 px-1 py-0 font-mono text-3xs leading-4">
        Esc
      </kbd>
      <span>descartar</span>
    </span>
  );
}

import React from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { talkxScaleIn } from '@/components/ui/motion/variants';
import { cn } from '@/lib/utils';
import type { TileColor } from './constants';
import { IconTile, TalkXPrimaryButton } from './primitives';

// ════════════════════════════════════════════════════════════════════════════
// E19 / X049 — modal único do kit
// `TalkXDialogShell`: barra de título + "✕", corpo e rodapé; base da confirmação
// e dos formulários. `TalkXConfirmDialog` é montado sobre ela.
// ════════════════════════════════════════════════════════════════════════════

export type TalkXTone = 'primary' | 'danger' | 'success' | 'violet';

export interface ConfirmCheck { id: string; label: string; }
export interface ConfirmDetail { label: string; value: string; }
export interface ConfirmReasonField { label: string; placeholder?: string; required?: boolean; }

/** Tom aplicado ao tile quando o chamador não escolhe cor própria. */
function toneTileColor(tone: TalkXTone): TileColor {
  return tone === 'danger' ? 'red' : tone === 'success' ? 'green' : tone === 'violet' ? 'violet' : 'blue';
}
/** Tone do `TalkXPrimaryButton`; o violeta é aplicado por classe própria. */
function buttonTone(tone: TalkXTone): 'primary' | 'danger' | 'success' {
  return tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'primary';
}
/** Violeta do sistema (token `--violeta`), mesmo tom de `talkx-tile--violet`. */
function buttonToneClass(tone: TalkXTone): string {
  return tone === 'violet' ? 'bg-violeta text-violeta-foreground hover:bg-violeta/90' : '';
}
function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return 'Não foi possível concluir a ação.';
}

/**
 * Casca do modal do kit: barra de título com "✕", corpo livre e rodapé de
 * ações. Entrada com `talkxScaleIn` (desligada em `prefers-reduced-motion`) e
 * foco inicial opcional (usado pelos destrutivos para abrir no "Cancelar").
 */
export function TalkXDialogShell({ open, onClose, title, children, footer, className, initialFocusRef, role = 'dialog' }: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode; className?: string;
  initialFocusRef?: { current: HTMLElement | null }; role?: 'dialog' | 'alertdialog';
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        role={role}
        aria-describedby={undefined}
        onOpenAutoFocus={e => {
          if (initialFocusRef?.current) { e.preventDefault(); initialFocusRef.current.focus(); }
        }}
        className={cn('w-full max-w-md gap-0 overflow-hidden p-0', className)}
      >
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          variants={prefersReducedMotion ? undefined : talkxScaleIn}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</DialogTitle>
            <button type="button" onClick={onClose} aria-label="Fechar"
              className="talkx-glow-ring -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-4">{children}</div>
          {footer !== undefined && (
            <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">{footer}</div>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

/** Pergunta do mock: o nome entra em negrito entre aspas no lugar de `{nome}`. */
function ConfirmQuestion({ description, entityName }: { description: string; entityName?: string }) {
  if (!entityName) return <>{description}</>;
  const partes = description.split('{nome}');
  if (partes.length === 1) {
    return <><span className="font-semibold text-foreground">"{entityName}"</span> — {description}</>;
  }
  return (
    <>
      {partes[0]}
      <span className="font-semibold text-foreground">"{entityName}"</span>
      {partes[1]}
    </>
  );
}

export function TalkXConfirmDialog({
  open, onClose, onConfirm, icon, iconColor, title, subtitle, description, consequence,
  entityName, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary',
  checks = [], details = [], reasonField, loading: loadingProp = false,
}: {
  open: boolean; onClose: () => void;
  onConfirm: (valores: { reason: string }) => unknown | Promise<unknown>;
  icon: LucideIcon; iconColor?: TileColor;
  title: string; subtitle?: string; description: string; consequence?: string;
  entityName?: string; confirmLabel?: string; cancelLabel?: string;
  tone?: TalkXTone; checks?: ConfirmCheck[]; details?: ConfirmDetail[];
  reasonField?: ConfirmReasonField; loading?: boolean;
}) {
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const checksOk = checks.length === 0 || checks.every(c => checked.has(c.id));
  const reasonOk = !reasonField?.required || reason.trim().length > 0;
  // "Nada pendente" para a trava do botão: checks marcados e motivo (se exigido) escrito.
  const allChecked = checksOk && reasonOk;
  // O botão confirma travado conta o `loading` do chamador e o `pending` interno
  // como um só estado — a action em curso mantém o modal ocupado.
  const loading = loadingProp || pending;

  const toggle = (id: string) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setChecked(n);
  };

  // Reset ao fechar
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { if (!open) { setChecked(new Set()); setReason(''); setError(null); setPending(false); } }, [open]);

  const handleConfirm = async () => {
    if (!allChecked || loading) return;
    setError(null);
    let result: unknown | Promise<unknown>;
    try {
      result = onConfirm({ reason });
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true);
      try {
        const value = await result;
        if (value !== false) onClose();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setPending(false);
      }
      return;
    }
    if (result !== false) onClose();
  };

  const detailsBlock = details.length > 0 && (
    <div className="mt-3 space-y-1.5 rounded-lg bg-muted/30 p-3">
      {details.map(d => (
        <div key={d.label} className="flex justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{d.label}</span>
          <span className="truncate text-right font-medium text-foreground">{d.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <TalkXDialogShell
      open={open} onClose={onClose} title={title} role="alertdialog"
      initialFocusRef={tone === 'danger' ? cancelRef : undefined}
      footer={
        <>
          <button ref={cancelRef} type="button" onClick={onClose} disabled={loading}
            className="h-9 rounded-lg border border-border/70 bg-input/40 px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {cancelLabel}
          </button>
          <TalkXPrimaryButton tone={buttonTone(tone)} glow={tone !== 'danger'}
            loading={loading} disabled={!allChecked || loading} onClick={handleConfirm}
            className={cn('h-9 text-[13px]', buttonToneClass(tone))}
          >
            {confirmLabel}
          </TalkXPrimaryButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <IconTile icon={icon} color={iconColor ?? toneTileColor(tone)} size={48} glow />
        {subtitle && <p className="text-base font-semibold text-foreground">{subtitle}</p>}
        <p className="text-[13px] leading-snug text-foreground-secondary">
          <ConfirmQuestion description={description} entityName={entityName} />
        </p>
        {consequence && <p className="text-2xs text-muted-foreground">{consequence}</p>}
      </div>

      {detailsBlock}

      {checks.length > 0 && (
        <div className="mt-3 space-y-2">
          {checks.map(c => (
            <label key={c.id} className="group flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-primary" />
              <span className="text-xs leading-snug text-foreground group-hover:text-foreground">{c.label}</span>
            </label>
          ))}
        </div>
      )}

      {reasonField && (
        <label className="mt-3 block space-y-1.5">
          <span className="text-xs font-medium text-foreground">{reasonField.label}</span>
          <textarea value={reason} rows={3} placeholder={reasonField.placeholder}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded-lg border border-border/70 bg-input/40 px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </TalkXDialogShell>
  );
}

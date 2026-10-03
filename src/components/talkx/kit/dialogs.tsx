import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { TileColor } from './constants';
import { IconTile, TalkXPrimaryButton } from './primitives';

// ════════════════════════════════════════════════════════════════════════════
// E19 — TalkXConfirmDialog: modal crítico com checks opcionais
// ════════════════════════════════════════════════════════════════════════════
export interface ConfirmCheck { id: string; label: string; }

export function TalkXConfirmDialog({ open, onClose, onConfirm, icon, iconColor = 'blue', title, description, entityName, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', checks = [], details = [], loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  icon: LucideIcon; iconColor?: TileColor; title: string; description: string;
  entityName?: string; confirmLabel?: string; cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'success' | 'violet'; checks?: ConfirmCheck[];
  details?: { label: string; value: string }[]; loading?: boolean;
}) {
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const allChecked = checks.length === 0 || checks.every(c => checked.has(c.id));
  const toneStyle = { danger: 'bg-destructive text-white', success: 'bg-success text-white', violet: 'bg-violet-600 text-white', primary: '' }[tone];

  const toggle = (id: string) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setChecked(n);
  };

  // Reset ao fechar
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { if (!open) setChecked(new Set()); }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={v => !v && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex flex-col items-center gap-3 pb-2">
            <IconTile icon={icon} color={iconColor} size={48} glow />
            <AlertDialogTitle className="text-center text-lg">{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[13px]">
              {entityName ? <><span className="font-semibold text-foreground">"{entityName}"</span> — </> : null}{description}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        {details.length > 0 && (
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 -mt-1">
            {details.map(d => (
              <div key={d.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {checks.length > 0 && (
          <div className="space-y-2 py-1">
            {checks.map(c => (
              <label key={c.id} className="flex items-start gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)}
                  className="mt-0.5 w-4 h-4 accent-primary cursor-pointer rounded" />
                <span className="text-xs text-foreground leading-snug group-hover:text-foreground">{c.label}</span>
              </label>
            ))}
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onClose} className="h-9 text-[13px]">{cancelLabel}</AlertDialogCancel>
          <TalkXPrimaryButton tone={tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'primary'}
            glow={tone !== 'danger'} loading={loading} disabled={!allChecked || loading} onClick={onConfirm}
            className="h-9 text-[13px]"
          >
            {confirmLabel}
          </TalkXPrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

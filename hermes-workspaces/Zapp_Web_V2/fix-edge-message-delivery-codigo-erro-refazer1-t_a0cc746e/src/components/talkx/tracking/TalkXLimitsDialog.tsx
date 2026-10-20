/**
 * X154 (TL-161) — modal "Editar Limites de Envio" (tela 12), movido para o kit.
 *
 * Mantém as funções de X006: o banco guarda os intervalos em milissegundos, o modal
 * exibe e recebe segundos, e a conversão (`secondsToMs`) acontece na montagem do
 * payload (regras em `./talkxCampaignRules`) — digitar 10 no intervalo mínimo grava
 * 10000 ms, nunca 10.
 */
import { useMemo } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { LIMITS_MIN_S, LIMITS_MAX_S } from '../talkxLimits';
import {
  isValidLimitsDraft, limitsPayload, profileIntervalSeconds,
  type TalkXLimitsDraft, type TalkXLimitsPayload,
} from './talkxCampaignRules';

export interface TalkXLimitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TalkXLimitsDraft;
  onChange: (patch: Partial<TalkXLimitsDraft>) => void;
  onSave: (limits: TalkXLimitsPayload) => void;
  saving?: boolean;
}

export function TalkXLimitsDialog({ open, onOpenChange, draft, onChange, onSave, saving = false }: TalkXLimitsDialogProps) {
  // X006: o select mostra "Personalizado" quando o intervalo digitado à mão difere
  // do intervalo do perfil escolhido (o perfil é mantido).
  const intervaloCustomizado = useMemo(() => {
    const [minS, maxS] = profileIntervalSeconds(draft.speedProfile);
    return draft.intervalMin !== minS || draft.intervalMax !== maxS;
  }, [draft.speedProfile, draft.intervalMin, draft.intervalMax]);

  const handleSave = () => {
    if (!isValidLimitsDraft(draft)) {
      toast.error(`Intervalos devem ser inteiros entre ${LIMITS_MIN_S}s e ${LIMITS_MAX_S}s.`);
      return;
    }
    onSave(limitsPayload(draft));
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Editar Limites de Envio</AlertDialogTitle>
          <AlertDialogDescription>Vale a partir do próximo envio.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Velocidade</label>
            <select
              value={intervaloCustomizado ? 'personalizado' : draft.speedProfile}
              onChange={(e) => {
                const profile = e.target.value;
                if (profile === 'personalizado') return;
                const [minS, maxS] = profileIntervalSeconds(profile);
                onChange({ speedProfile: profile, intervalMin: minS, intervalMax: maxS });
              }}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="slow">Lento (seguro)</option>
              <option value="moderate">Moderado</option>
              <option value="fast">Rápido</option>
              {intervaloCustomizado && <option value="personalizado">Personalizado</option>}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Intervalo mínimo (s)</label>
              <input
                type="number" min={LIMITS_MIN_S} max={LIMITS_MAX_S} value={draft.intervalMin}
                onChange={(e) => onChange({ intervalMin: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Intervalo máximo (s)</label>
              <input
                type="number" min={LIMITS_MIN_S} max={LIMITS_MAX_S} value={draft.intervalMax}
                onChange={(e) => onChange({ intervalMax: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Janela início</label>
              <input
                type="time" value={draft.windowStart}
                onChange={(e) => onChange({ windowStart: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Janela fim</label>
              <input
                type="time" value={draft.windowEnd}
                onChange={(e) => onChange({ windowEnd: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={draft.businessHoursOnly}
              onChange={(e) => onChange({ businessHoursOnly: e.target.checked })}
              className="rounded"
            />
            <span className="text-xs text-foreground">Apenas horário comercial (seg–sex 8h–18h)</span>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Salvando…' : 'Salvar Limites'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// SystemHealthCard.tsx — cartão "Saúde do Sistema" do painel principal (staff).
//
// Indicador-resumo que faltava na V2 (existia na V3 com fn_system_health_score). A nota
// 0-100 e o detalhe por sinal vêm da regra pura em ../systemHealth.ts, calculada no cliente
// a partir de useSystemHealthSignals — nada é inventado aqui. Só tokens/classes que já
// existem no projeto; a navegação para o Diagnóstico reaproveita navigateToView.

import { Activity, ArrowRight } from 'lucide-react';
import { DashboardCard, SectionHeader, Pill, ProgressBar } from './DashboardCard';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { useSystemHealthSignals } from '@/hooks/system/useSystemHealthSignals';
import { deriveSystemHealth, type SystemHealthItemStatus, type SystemHealthResult } from '../systemHealth';

const STATUS_LABEL: Record<SystemHealthItemStatus, string> = { ok: 'OK', warn: 'Atenção', bad: 'Falha' };
const PILL_TONE: Record<SystemHealthItemStatus, 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
};

export interface SystemHealthCardProps {
  /** Abre o Diagnóstico. Padrão: navega para a view "diagnostics". */
  onOpenDiagnostics?: () => void;
}

export function SystemHealthCard({ onOpenDiagnostics }: SystemHealthCardProps) {
  const { signals, isLoading, isError } = useSystemHealthSignals();
  const openDiagnostics = onOpenDiagnostics ?? (() => navigateToView('diagnostics'));

  return (
    <DashboardCard testid="system-health-card" className="min-h-[173px]">
      <SectionHeader icon={Activity} title="Saúde do Sistema" subtitle="Resumo dos sinais das últimas 24h" tileSize={44} />
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground min-h-[100px]">
          Medindo a saúde do sistema…
        </div>
      ) : isError || !signals ? (
        // Erro de coleta NÃO vira nota: sem sinal medido, o card não afirma saúde nenhuma.
        <div className="flex-1 flex items-center justify-center text-center text-xs text-muted-foreground min-h-[100px]">
          Não foi possível medir a saúde do sistema agora.
        </div>
      ) : (
        <SystemHealthContent result={deriveSystemHealth(signals)} onOpenDiagnostics={openDiagnostics} />
      )}
    </DashboardCard>
  );
}

function SystemHealthContent({ result, onOpenDiagnostics }: { result: SystemHealthResult; onOpenDiagnostics: () => void }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3">
      <div className="flex flex-col items-start">
        <p data-testid="system-health-score" className="text-3xl font-bold tabular-nums text-foreground leading-none">
          {result.score}
        </p>
        <span className="text-2xs text-foreground-secondary mt-0.5">de 100</span>
        <Pill className="mt-1.5" label={result.gradeLabel} tone={result.tone} dot />
        <button
          type="button"
          data-testid="system-health-diagnostics"
          onClick={onOpenDiagnostics}
          className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-[hsl(var(--primary-text))] hover:underline"
        >
          Ver Diagnóstico
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="flex flex-col gap-2 justify-center">
        {result.items.map((item) => (
          <div key={item.id} data-testid="system-health-signal" data-signal={item.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-semibold text-foreground truncate">{item.label}</span>
              <Pill label={STATUS_LABEL[item.status]} tone={PILL_TONE[item.status]} />
            </div>
            <ProgressBar
              value={item.max > 0 ? (item.score / item.max) * 100 : 0}
              tone={PILL_TONE[item.status]}
              height={4}
              className="my-1"
            />
            <p className="text-2xs text-foreground-secondary truncate">{item.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

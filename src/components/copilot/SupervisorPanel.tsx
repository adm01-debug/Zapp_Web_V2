// CV-127–128: SupervisorPanel component
import React from 'react';
import type { SupervisorAlert, VendorPerformance } from '../../hooks/copilot/useSupervisorView';
import { useSupervisorView } from '../../hooks/copilot/useSupervisorView';

export interface SupervisorPanelProps {
  vendorIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_CLASSES: Record<SupervisorAlert['severity'], string> = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const SEVERITY_LABELS: Record<SupervisorAlert['severity'], string> = {
  info: 'Info',
  warning: 'Atenção',
  critical: 'Crítico',
};

function AlertRow({ alert, onIntervene }: { alert: SupervisorAlert; onIntervene: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
      <span
        className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
          SEVERITY_CLASSES[alert.severity]
        }`}
      >
        {SEVERITY_LABELS[alert.severity]}
      </span>
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{alert.message}</span>
      <button
        onClick={onIntervene}
        className="shrink-0 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
      >
        Intervir
      </button>
    </div>
  );
}

function VendorCard({ performance }: { performance: VendorPerformance }) {
  const pct = Math.round(performance.copilotAcceptanceRate * 100);
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
          {performance.vendorId}
        </span>
        <span className="text-xs text-gray-500">{performance.activeConversations} ativas</span>
      </div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>Aceitação copiloto</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {performance.lossRiskCount > 0 && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {performance.lossRiskCount} risco{performance.lossRiskCount > 1 ? 's' : ''} de perda
        </p>
      )}
    </div>
  );
}

/**
 * CV-127–128
 * Supervisor panel showing real-time alerts and per-vendor performance cards.
 * Only renders when vendorIds.length > 0 and isOpen is true.
 */
export function SupervisorPanel({ vendorIds, isOpen, onClose }: SupervisorPanelProps) {
  const { performances, alerts, intervene } = useSupervisorView(vendorIds);

  if (!isOpen || vendorIds.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Painel do Supervisor"
      className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col bg-white dark:bg-gray-900 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Supervisor RADAR</h2>
        <button
          onClick={onClose}
          aria-label="Fechar painel"
          className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Alerts */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Alertas ({alerts.length})
          </h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <AlertRow
                  key={`${alert.conversationId}-${alert.timestamp}`}
                  alert={alert}
                  onIntervene={() => intervene(alert.conversationId, '')}
                />
              ))}
            </div>
          )}
        </section>

        {/* Vendor cards */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Vendedores ({performances.length})
          </h3>
          <div className="space-y-2">
            {performances.map((perf) => (
              <VendorCard key={perf.vendorId} performance={perf} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

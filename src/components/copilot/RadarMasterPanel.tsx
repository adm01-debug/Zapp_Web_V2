/**
 * CV-143–144: RadarMasterPanel — unified RADAR panel that replaces the Phase 6/7 panels.
 * Renders collapsible card sections based on active RADAR state.
 */
import React, { useState } from 'react';
import type { RadarOrchestratorState } from '../../hooks/copilot/useRadarOrchestrator';

export interface RadarMasterPanelProps {
  conversationId: string;
  contactId: string;
  vendorId: string;
  isOpen: boolean;
  onClose: () => void;
  mode?: 'mini' | 'normal' | 'focus';
  state?: Partial<RadarOrchestratorState>;
}

interface CollapsibleCardProps {
  title: string;
  id: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger';
}

function CollapsibleCard({ title, id, collapsed, onToggle, children, variant = 'default' }: CollapsibleCardProps) {
  const variantClass =
    variant === 'danger'
      ? 'border-red-300 dark:border-red-700'
      : variant === 'warning'
      ? 'border-yellow-300 dark:border-yellow-700'
      : 'border-zinc-200 dark:border-zinc-700';

  return (
    <div className={`rounded-lg border ${variantClass} bg-white dark:bg-zinc-900 overflow-hidden`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        aria-expanded={!collapsed}
      >
        <span>{title}</span>
        <span className="ml-2 text-xs text-zinc-400">{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 pt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
      )}
    </div>
  );
}

const LOSSRISK_LABELS: Record<string, string> = {
  low: 'Baixo risco de perda',
  medium: 'Risco moderado de perda',
  high: 'Alto risco de perda',
  critical: 'Risco crítico — ação imediata',
};

const SPEED_LABELS: Record<string, string> = {
  yellow: 'Resposta lenta — atenção',
  orange: 'Resposta muito lenta',
  red: 'Lead esfriando — responder agora',
};

export function RadarMasterPanel({
  isOpen,
  onClose,
  mode = 'normal',
  state = {},
}: RadarMasterPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCard = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!isOpen) return null;

  const {
    leadTemperature = 50,
    hasActiveObjection = false,
    lossRiskLevel = 'none',
    hasProductRecommendation = false,
    hasQuoteDraft = false,
    multimodalPrimaryAction = null,
    hasPrivacyViolation = false,
    supervisorAlertCount = 0,
    speedToLeadAlertLevel = 'none',
  } = state;

  const hasAnything =
    hasActiveObjection ||
    lossRiskLevel !== 'none' ||
    hasProductRecommendation ||
    hasQuoteDraft ||
    multimodalPrimaryAction !== null ||
    hasPrivacyViolation ||
    supervisorAlertCount > 0;

  const panelWidth =
    mode === 'mini' ? 'w-64' : mode === 'focus' ? 'w-96' : 'w-80';

  return (
    <aside
      role="complementary"
      aria-label="RADAR Copiloto de Vendas"
      className={`flex flex-col gap-2 p-3 ${panelWidth} bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          RADAR
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar RADAR"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-base leading-none"
        >
          ×
        </button>
      </div>

      {/* 1. Lead Thermometer — always visible */}
      <CollapsibleCard
        id="thermometer"
        title={`🌡 Temperatura do lead — ${leadTemperature}%`}
        collapsed={collapsed['thermometer'] ?? false}
        onToggle={toggleCard}
      >
        <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500 transition-all"
            style={{ width: `${leadTemperature}%` }}
          />
        </div>
        {speedToLeadAlertLevel !== 'none' && (
          <p className="mt-1 text-yellow-600 dark:text-yellow-400 text-xs font-medium">
            ⚡ {SPEED_LABELS[speedToLeadAlertLevel]}
          </p>
        )}
      </CollapsibleCard>

      {/* 2. Active Objection */}
      {hasActiveObjection && (
        <CollapsibleCard
          id="objection"
          title="⚠️ Objeção ativa detectada"
          collapsed={collapsed['objection'] ?? false}
          onToggle={toggleCard}
          variant="warning"
        >
          <p>O cliente sinalizou resistência. Considere usar uma jogada de objeção.</p>
        </CollapsibleCard>
      )}

      {/* 3. Loss Risk */}
      {lossRiskLevel !== 'none' && (
        <CollapsibleCard
          id="lossrisk"
          title={`🚨 ${LOSSRISK_LABELS[lossRiskLevel] ?? 'Risco de perda'}`}
          collapsed={collapsed['lossrisk'] ?? false}
          onToggle={toggleCard}
          variant={lossRiskLevel === 'critical' || lossRiskLevel === 'high' ? 'danger' : 'warning'}
        >
          <p>Sinais de desengajamento detectados. Ajuste a abordagem.</p>
        </CollapsibleCard>
      )}

      {/* 4. Product Recommendation */}
      {hasProductRecommendation && (
        <CollapsibleCard
          id="product"
          title="🛍 Sugestão de produto"
          collapsed={collapsed['product'] ?? false}
          onToggle={toggleCard}
        >
          <p>Produto relevante identificado para este lead. Ver detalhes.</p>
        </CollapsibleCard>
      )}

      {/* 5. Quote Draft */}
      {hasQuoteDraft && (
        <CollapsibleCard
          id="quote"
          title="📋 Rascunho de orçamento"
          collapsed={collapsed['quote'] ?? false}
          onToggle={toggleCard}
        >
          <p>Rascunho gerado automaticamente. Revise antes de enviar.</p>
        </CollapsibleCard>
      )}

      {/* 6. Multimodal Insight */}
      {multimodalPrimaryAction !== null && (
        <CollapsibleCard
          id="multimodal"
          title="🔍 Insight multimodal"
          collapsed={collapsed['multimodal'] ?? false}
          onToggle={toggleCard}
        >
          <p>Ação sugerida: <strong>{multimodalPrimaryAction}</strong></p>
        </CollapsibleCard>
      )}

      {/* 7. Privacy Guard */}
      {hasPrivacyViolation && (
        <CollapsibleCard
          id="privacy"
          title="🔒 Alerta de privacidade"
          collapsed={collapsed['privacy'] ?? false}
          onToggle={toggleCard}
          variant="danger"
        >
          <p>Possível dado sensível detectado na conversa. Revise antes de continuar.</p>
        </CollapsibleCard>
      )}

      {/* 8. Coaching Hints */}
      {supervisorAlertCount > 0 && (
        <CollapsibleCard
          id="coaching"
          title={`💡 ${supervisorAlertCount} dica${supervisorAlertCount > 1 ? 's' : ''} de coaching`}
          collapsed={collapsed['coaching'] ?? false}
          onToggle={toggleCard}
        >
          <p>O supervisor identificou oportunidades de melhoria nesta conversa.</p>
        </CollapsibleCard>
      )}

      {/* Empty state */}
      {!hasAnything && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-zinc-400 dark:text-zinc-500">
          <span className="text-2xl">✓</span>
          <p className="text-xs">Tudo em ordem — continue a conversa</p>
        </div>
      )}
    </aside>
  );
}

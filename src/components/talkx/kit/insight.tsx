import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Clock, MessageSquare, RefreshCw, MousePointerClick, Sparkles } from 'lucide-react';

import { useTalkxAi } from '@/hooks/talkx/useTalkxAi';
import { regraParaExplicar } from '@/hooks/talkx/talkxAiSuggestions';

// ─── E92: InsightCard ──────────────────────────────────────────────────────────────────────
export type InsightType = 'timing' | 'template' | 'reactivation' | 'links';
export type InsightPriority = 'high' | 'medium' | 'low';

const INSIGHT_ICON: Record<InsightType, LucideIcon> = {
  timing: Clock,
  template: MessageSquare,
  reactivation: RefreshCw,
  links: MousePointerClick,
};

const INSIGHT_COLOR: Record<InsightPriority, string> = {
  high:   'border-l-red-500   bg-red-50   dark:bg-red-950/30',
  medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',
  low:    'border-l-blue-500  bg-blue-50  dark:bg-blue-950/30',
};

const PRIORITY_LABEL: Record<InsightPriority, string> = {
  high: 'Prioridade alta', medium: 'Prioridade média', low: 'Prioridade baixa',
};

export function InsightCard({
  type,
  title,
  description,
  priority,
  applyLabel,
  onApply,
  explicacao,
}: {
  type: InsightType;
  title: string;
  description: string;
  priority: InsightPriority;
  applyLabel?: string;
  onApply?: () => void;
  /**
   * X076/IA-161: quando presente, o cartao mostra "Explicar com IA" e manda os
   * numeros JA CALCULADOS do insight para a edge `insight_text`. Sem isso o kind
   * ficava sem tela; com isso o texto vem do modelo, mas o dado nunca sai do
   * cliente sem ser o proprio resultado da heuristica (sem PII).
   */
  explicacao?: { type: string; title: string; description: string; priority: string; meta?: Record<string, unknown> } | null;
}) {
  const Icon = INSIGHT_ICON[type] ?? MessageSquare;
  return (
    <div className={'rounded-lg border border-l-4 p-4 ' + INSIGHT_COLOR[priority]}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-3xs font-medium text-muted-foreground border rounded px-1 py-0 leading-4">
              Heurístico
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          {applyLabel && onApply && (
            <button
              type="button"
              onClick={onApply}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              {applyLabel} →
            </button>
          )}
          {explicacao && <ExplicarComIa explicacao={explicacao} />}
        </div>
        <span className="shrink-0 text-3xs text-muted-foreground">{PRIORITY_LABEL[priority]}</span>
      </div>
    </div>
  );
}

/**
 * X076/IA-161: o botao de `insight_text`, isolado em um componente proprio.
 *
 * O `useTalkxAi` precisa de `QueryClientProvider`, e nem toda tela que mostra
 * `InsightCard` (Visao geral, campanha em andamento) tem um. Montando o botao so
 * quando o consumidor passa `explicacao`, telas sem IA continuam funcionando
 * exatamente como antes - o hook so existe onde a funcionalidade existe.
 */
function ExplicarComIa({
  explicacao,
}: {
  explicacao: { type: string; title: string; description: string; priority: string; meta?: Record<string, unknown> };
}) {
  const ia = useTalkxAi();
  const [textoIa, setTextoIa] = useState<string | null>(null);
  const [erroIa, setErroIa] = useState<string | null>(null);

  const explicar = () => {
    setErroIa(null);
    ia.mutate(
      { kind: 'insight_text', input: { regra: regraParaExplicar(explicacao) } },
      {
        onSuccess: (resposta) => {
          const texto = typeof resposta.output === 'string' ? resposta.output.trim() : '';
          if (texto === '') { setErroIa('A IA não devolveu texto. Nada foi alterado.'); return; }
          setTextoIa(texto);
        },
        // Recusa da edge (IA desligada, teto do mes, limite diario) vem com o
        // texto que o servidor devolveu; nada e inventado no cliente.
        onError: (erro) => setErroIa((erro as Error).message),
      },
    );
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={explicar}
        disabled={ia.isPending}
        aria-expanded={textoIa !== null}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
      >
        <Sparkles className="w-3 h-3" />{ia.isPending ? 'Explicando…' : 'Explicar com IA'}
      </button>
      {textoIa !== null && (
        <p role="status" className="mt-1.5 text-xs text-foreground-secondary leading-relaxed">{textoIa}</p>
      )}
      {erroIa !== null && (
        <p role="status" className="mt-1.5 text-xs text-dash-red">{erroIa}</p>
      )}
    </div>
  );
}

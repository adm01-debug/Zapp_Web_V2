/**
 * CV-041–050 — Painel de sugestões ao vivo do copilot RADAR.
 * Exibe 3 caminhos estratégicos (avançar, descobrir, relacionar) com tone chips,
 * split de mensagem e justificativa de fontes.
 */
import React, { useState } from 'react';
import { ChevronRight, Search, Heart, Scissors, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveSuggestion } from '@/hooks/copilot/useLiveSuggestions';

// ─── Tone chips (CV-049) ──────────────────────────────────────
export const LIVE_TONE_CHIPS = [
  { id: 'formal', label: 'Formal' },
  { id: 'casual', label: 'Casual' },
  { id: 'curta', label: 'Curta' },
  { id: 'confiante', label: 'Confiante' },
  { id: 'urgente', label: 'Urgente' },
] as const;

export type LiveTone = (typeof LIVE_TONE_CHIPS)[number]['id'];

// ─── Metadados por caminho (CV-043) ──────────────────────────
const PATH_META = {
  avancar: {
    label: 'Avançar',
    Icon: ChevronRight,
    color: 'border-green-400/40 bg-green-400/5',
    iconColor: 'text-green-500',
  },
  descobrir: {
    label: 'Descobrir',
    Icon: Search,
    color: 'border-indigo-400/40 bg-indigo-400/5',
    iconColor: 'text-indigo-500',
  },
  relacionar: {
    label: 'Relacionar',
    Icon: Heart,
    color: 'border-pink-400/40 bg-pink-400/5',
    iconColor: 'text-pink-500',
  },
} as const;

// ─── Props ────────────────────────────────────────────────────
interface LiveSuggestionsProps {
  suggestions: LiveSuggestion[];
  loading: boolean;
  onUse: (text: string) => void;
  onUseSplit?: (parts: string[]) => void;
  onRefresh?: () => void;
  className?: string;
}

// ─── SuggestionCard ──────────────────────────────────────────
interface SuggestionCardProps {
  suggestion: LiveSuggestion;
  tone: LiveTone | null;
  onUse: (text: string) => void;
  onUseSplit?: (parts: string[]) => void;
}

function SuggestionCard({ suggestion, tone: _tone, onUse, onUseSplit }: SuggestionCardProps) {
  const [showSources, setShowSources] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const meta = PATH_META[suggestion.path] ?? PATH_META.avancar;
  const hasSplit = (suggestion.split_messages?.length ?? 0) > 1;
  const hasSources = (suggestion.sources?.length ?? 0) > 0;

  return (
    <div className={cn('rounded-lg border p-3 text-sm', meta.color)}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <meta.Icon className={cn('h-3.5 w-3.5 shrink-0', meta.iconColor)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        {suggestion.play_name && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {suggestion.play_name}
          </span>
        )}
      </div>

      {/* Texto principal */}
      <p className="text-xs leading-relaxed mb-2">{suggestion.text}</p>

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onUse(suggestion.text)}
          className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          Usar
        </button>

        {hasSplit && onUseSplit && suggestion.split_messages && (
          <button
            type="button"
            onClick={() => setShowSplit((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title="Enviar em partes"
          >
            <Scissors className="h-3 w-3" />
            {showSplit ? 'Ocultar partes' : 'Enviar em partes'}
          </button>
        )}

        {hasSources && (
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            {showSources ? 'Ocultar justificativa' : 'Por que sugerindo?'}
          </button>
        )}
      </div>

      {/* Split messages (CV-047) */}
      {showSplit && hasSplit && suggestion.split_messages && (
        <div className="mt-2 space-y-1.5">
          {suggestion.split_messages.map((part, i) => (
            <div key={i} className="flex items-start gap-2 rounded bg-muted/50 px-2 py-1.5">
              <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
              <p className="text-[10px] leading-relaxed flex-1">{part}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onUseSplit!(suggestion.split_messages!)}
            className="w-full rounded border border-primary/30 bg-primary/10 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            Usar todas as partes
          </button>
        </div>
      )}

      {/* Fontes / Justificativa (CV-040) */}
      {showSources && hasSources && (
        <div className="mt-2 space-y-1">
          {(suggestion.sources ?? []).map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1.5 text-[10px]">
              {s.letter && (
                <span className="shrink-0 font-bold text-primary">{s.letter}</span>
              )}
              <span className="text-muted-foreground line-clamp-2">{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {!hasSources && (
        <p className="mt-1.5 text-[10px] text-muted-foreground italic">(justificativa não disponível)</p>
      )}
    </div>
  );
}

// ─── LiveSuggestions (painel principal) ──────────────────────
export function LiveSuggestions({
  suggestions,
  loading,
  onUse,
  onUseSplit,
  onRefresh,
  className,
}: LiveSuggestionsProps) {
  const [activeTone, setActiveTone] = useState<LiveTone | null>(null);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Tone chips (CV-049) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground shrink-0">Tom:</span>
        {LIVE_TONE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setActiveTone(activeTone === chip.id ? null : chip.id)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
              activeTone === chip.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {chip.label}
          </button>
        ))}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Atualizar sugestões"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Estado de carregamento */}
      {loading && suggestions.length === 0 && (
        <div className="flex items-center gap-2 py-4 text-center justify-center text-muted-foreground text-xs">
          <Sparkles className="h-4 w-4 animate-pulse" />
          RADAR analisando...
        </div>
      )}

      {/* Cartões de sugestão */}
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          tone={activeTone}
          onUse={onUse}
          onUseSplit={onUseSplit}
        />
      ))}

      {/* Estado vazio */}
      {!loading && suggestions.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          Aguardando momento-chave para gerar sugestões...
        </p>
      )}
    </div>
  );
}

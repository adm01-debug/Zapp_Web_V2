/**
 * CV-051–060 — Painel RADAR flutuante.
 * Pop-up encaixado no Chat Panel: arrastável, 3 modos, mobile bottom drawer,
 * "não perturbe", acessibilidade, atalhos de teclado, indicador de pensamento.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Minimize2, Maximize2, Minus, BellOff, Bell, RefreshCw, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RadarMode, RadarCardId } from '@/hooks/copilot/useRadarPanel';
import type { CopilotSessionState } from '@/hooks/copilot/useCopilotSession';
import type { LiveSuggestion } from '@/hooks/copilot/useLiveSuggestions';
import {
  StageCard,
  BrindeCard,
  SuggestionsCard,
  NextStepCard,
  AlertsCard,
  ProductsCard,
  DecisionMakerCard,
} from './RadarCards';

// ─── Props ────────────────────────────────────────────────────
export interface RadarPanelProps {
  // State from useRadarPanel
  mode: RadarMode;
  collapsed: boolean;
  collapsedCards: RadarCardId[];
  cardOrder: RadarCardId[];
  isDnd: boolean;
  onSetMode: (m: RadarMode) => void;
  onToggleCollapsed: () => void;
  onToggleCard: (id: RadarCardId) => void;
  onEnableDnd: (conversationId?: string) => void;
  onClearDnd: () => void;

  // Data
  session: CopilotSessionState | null;
  sessionLoading: boolean;
  suggestions: LiveSuggestion[];
  suggestionsLoading: boolean;
  onUseSuggestion: (text: string) => void;
  onUseSplit?: (parts: string[]) => void;
  onRefresh?: () => void;

  // Extra derived data (passed from parent — no extra fetches here)
  nextStep?: string | null;
  alerts?: string[];
  suggestedProducts?: string[];

  conversationId?: string;
  className?: string;
}

// ─── Mode buttons ─────────────────────────────────────────────
const MODE_OPTIONS: Array<{ id: RadarMode; label: string; title: string }> = [
  { id: 'mini', label: 'Mini', title: 'Modo Mini — melhor sugestão e medidor' },
  { id: 'normal', label: 'Normal', title: 'Modo Normal — cartões' },
  { id: 'focus', label: 'Foco', title: 'Modo Foco — painel completo' },
];

// ─── Timeout para "RADAR pensando" (CV-054) ──────────────────
const THINKING_TIMEOUT_MS = 8000;

// ─── RadarPanel ──────────────────────────────────────────────
export function RadarPanel({
  mode,
  collapsed,
  collapsedCards,
  cardOrder,
  isDnd,
  onSetMode,
  onToggleCollapsed,
  onToggleCard,
  onEnableDnd,
  onClearDnd,
  session,
  sessionLoading,
  suggestions,
  suggestionsLoading,
  onUseSuggestion,
  onRefresh,
  nextStep,
  alerts = [],
  suggestedProducts = [],
  conversationId,
  className,
}: RadarPanelProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [timedOut, setTimedOut] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevLoadingRef = useRef(false);

  // CV-054 — timeout para "RADAR pensando"
  useEffect(() => {
    if (suggestionsLoading && !prevLoadingRef.current) {
      setTimedOut(false);
      timeoutRef.current = setTimeout(() => setTimedOut(true), THINKING_TIMEOUT_MS);
    }
    if (!suggestionsLoading) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setTimedOut(false);
    }
    prevLoadingRef.current = suggestionsLoading;
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [suggestionsLoading]);

  // CV-055 — aria-live anuncia novas sugestões
  const latestSuggestionText = suggestions[0]?.text ?? null;

  // ─── Drag logic (CV-051) ──────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: position.x, initY: position.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: dragRef.current.initX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.initY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [position]);

  // ─── Keyboard shortcuts (CV-056) ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        onToggleCollapsed();
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        const idx = parseInt(e.key) - 1;
        if (suggestions[idx]) {
          e.preventDefault();
          onUseSuggestion(suggestions[idx].text);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onToggleCollapsed, onUseSuggestion, suggestions]);

  // ─── Mobile detection ─────────────────────────────────────
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // ─── Mini mode ────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        ref={panelRef}
        className={cn(
          'fixed z-50 right-4 bottom-24 flex items-center gap-2 rounded-full border border-border bg-background/95 shadow-lg px-3 py-1.5 cursor-grab select-none',
          className,
        )}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onMouseDown={onMouseDown}
        role="complementary"
        aria-label="RADAR Copiloto — recolhido"
      >
        <Radar className={cn('h-4 w-4 text-primary', suggestionsLoading && 'animate-pulse')} />
        <span className="text-[11px] font-semibold text-primary">RADAR</span>
        {suggestions.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">{suggestions.length}</span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ml-1 text-muted-foreground hover:text-foreground"
          aria-label="Expandir painel RADAR"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // ─── Mobile bottom drawer (CV-060) ───────────────────────
  if (isMobile) {
    return (
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-border bg-background/98 shadow-2xl p-4',
          className,
        )}
        role="complementary"
        aria-label="RADAR Copiloto"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Radar className={cn('h-4 w-4 text-primary', suggestionsLoading && 'animate-pulse')} />
            <span className="text-[12px] font-bold text-primary">RADAR</span>
          </div>
          <button type="button" onClick={onToggleCollapsed} aria-label="Fechar RADAR" className="text-muted-foreground hover:text-foreground">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        {suggestions[0] ? (
          <div
            className="rounded-lg border border-primary/20 bg-primary/5 p-3 cursor-pointer hover:bg-primary/10 transition-colors"
            onClick={() => onUseSuggestion(suggestions[0].text)}
            role="button"
            tabIndex={0}
            aria-label="Usar sugestão principal"
            onKeyDown={(e) => e.key === 'Enter' && onUseSuggestion(suggestions[0].text)}
          >
            <p className="text-xs leading-relaxed">{suggestions[0].text}</p>
            <p className="mt-1 text-[10px] text-primary">Toque para usar</p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic text-center py-2">
            {suggestionsLoading ? 'RADAR analisando...' : 'Aguardando momento-chave...'}
          </p>
        )}
        {nextStep && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold">Próximo passo:</span> {nextStep}
          </p>
        )}
      </div>
    );
  }

  // ─── Desktop floating panel ───────────────────────────────
  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 right-4 top-20 w-72 rounded-xl border border-border bg-background/97 shadow-2xl backdrop-blur-sm select-none',
        mode === 'mini' && 'w-60',
        mode === 'focus' && 'w-80',
        className,
      )}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      role="complementary"
      aria-label="RADAR Copiloto"
    >
      {/* Header — draggable (CV-051) */}
      <div
        className="flex items-center gap-1.5 rounded-t-xl border-b border-border/60 px-3 py-2 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
      >
        <Radar className={cn('h-4 w-4 text-primary shrink-0', suggestionsLoading && !timedOut && 'animate-pulse')} />
        <span className="text-[11px] font-bold text-primary flex-1">RADAR</span>

        {/* CV-054 — indicator */}
        {suggestionsLoading && !timedOut && (
          <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-ping mr-1" aria-hidden="true" />
        )}

        {/* Mode selector (CV-052) */}
        <div className="flex items-center gap-0.5 rounded border border-border/60 p-0.5">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.title}
              onClick={(e) => { e.stopPropagation(); onSetMode(m.id); }}
              className={cn(
                'rounded px-1 text-[9px] font-medium transition-colors',
                mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={mode === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* DND toggle (CV-058) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); isDnd ? onClearDnd() : onEnableDnd(conversationId); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={isDnd ? 'Retomar RADAR' : 'Silenciar RADAR (não perturbe)'}
          aria-label={isDnd ? 'Retomar RADAR' : 'Silenciar RADAR'}
        >
          {isDnd ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </button>

        {/* Refresh */}
        {onRefresh && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            disabled={suggestionsLoading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            aria-label="Atualizar RADAR"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', suggestionsLoading && 'animate-spin')} />
          </button>
        )}

        {/* Collapse */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Recolher painel RADAR"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* CV-054 — timeout message */}
      {timedOut && (
        <div className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border-b border-border/60">
          Não consegui analisar agora —{' '}
          <button type="button" className="underline" onClick={onRefresh}>tentar de novo</button>
        </div>
      )}

      {/* DND banner */}
      {isDnd && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40 border-b border-border/60">
          <BellOff className="h-3 w-3" />
          RADAR silenciado.{' '}
          <button type="button" className="underline ml-auto" onClick={onClearDnd}>Retomar</button>
        </div>
      )}

      {/* aria-live region (CV-055/057) — announces new suggestions to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {latestSuggestionText && `Nova sugestão do RADAR: ${latestSuggestionText}`}
      </div>

      {/* Mini mode body */}
      {mode === 'mini' && (
        <div className="p-3 space-y-2">
          <SuggestionsCard
            suggestions={suggestions.slice(0, 1)}
            loading={suggestionsLoading}
            collapsed={false}
            onToggle={() => {}}
            onUse={onUseSuggestion}
          />
          {session && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-bold">{session.stage}</span>
              <div className="flex gap-0.5">
                {(['B','R','I','N','D','E'] as const).map((l) => (
                  <span key={l} className={cn('font-bold text-[10px]', session.brinde_state[l] ? 'text-primary' : 'text-muted-foreground/30')}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Normal / Focus mode body */}
      {(mode === 'normal' || mode === 'focus') && (
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-2 space-y-1.5 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
          {cardOrder.map((cardId) => {
            const isCollapsed = collapsedCards.includes(cardId);
            switch (cardId) {
              case 'stage':
                return (
                  <StageCard
                    key="stage"
                    stage={session?.stage ?? null}
                    temperature={session?.temperature ?? null}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('stage')}
                  />
                );
              case 'brinde':
                return (
                  <BrindeCard
                    key="brinde"
                    brindeState={session?.brinde_state ?? null}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('brinde')}
                  />
                );
              case 'suggestions':
                return (
                  <SuggestionsCard
                    key="suggestions"
                    suggestions={suggestions}
                    loading={suggestionsLoading}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('suggestions')}
                    onUse={onUseSuggestion}
                  />
                );
              case 'next_step':
                return (
                  <NextStepCard
                    key="next_step"
                    nextStep={nextStep ?? null}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('next_step')}
                  />
                );
              case 'alerts':
                return (
                  <AlertsCard
                    key="alerts"
                    alerts={alerts}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('alerts')}
                  />
                );
              case 'products':
                return (
                  <ProductsCard
                    key="products"
                    products={suggestedProducts}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('products')}
                  />
                );
              case 'decision_maker':
                return (
                  <DecisionMakerCard
                    key="decision_maker"
                    decisionRole={session?.decision_role ?? null}
                    stakeholders={session?.stakeholders ?? []}
                    collapsed={isCollapsed}
                    onToggle={() => onToggleCard('decision_maker')}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
      )}

      {/* Footer — keyboard hint (CV-056) */}
      <div className="rounded-b-xl border-t border-border/40 px-3 py-1 text-[9px] text-muted-foreground/50 flex gap-3">
        <span>Ctrl+Shift+R: toggle</span>
        <span>Ctrl+1/2/3: usar sugestão</span>
      </div>
    </div>
  );
}
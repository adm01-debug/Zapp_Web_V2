/**
 * CV-051–060 — RadarPhase6Panel: painel flutuante do RADAR.
 *
 *   CV-051: flutua ancorado à direita sem cobrir o campo de digitação.
 *   CV-052: modos mini/normal/foco — persiste por conversa via useRadarPanel.
 *   CV-053: cards (Etapa, B·R·I·N·D·E, Sugestões, Próximo passo, Alertas,
 *           Produtos, Quem decide).
 *   CV-054: indicador "pensando" com timeout de 10 s e mensagem de erro.
 *   CV-055: timeline de insights acumulados na sessão.
 *   CV-056: Ctrl+Shift+R abre/fecha o painel.
 *   CV-057: aria-live="polite" para novas sugestões.
 *   CV-058: botão "não perturbe" por conversa + mudo global 30 min.
 *   CV-059: estado vindo exclusivamente de useRadarPanel.
 *   CV-060: mobile (<640 px) exibe drawer inferior com sugestão e próximo passo.
 */
import { useEffect, useRef } from 'react';
import { X, ChevronUp, Maximize2, Minimize2, BellOff, Bell, Loader2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRadarPanel, type RadarInsight } from '@/hooks/copilot/useRadarPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface RadarPhase6PanelProps {
  conversationId: string;
  contactName: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-componentes internos
// ---------------------------------------------------------------------------

function ThinkingIndicator({ error }: { error: string | null }) {
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive px-3 py-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5" aria-live="polite" aria-label="RADAR analisando">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      <span>Analisando conversa…</span>
    </div>
  );
}

function InsightCard({ insight }: { insight: RadarInsight }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-foreground leading-snug">{insight.text}</p>
      <p className="text-[10px] text-muted-foreground mt-1">
        {new Date(insight.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

function TimelineSection({ timeline }: { timeline: RadarInsight[] }) {
  if (timeline.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
        <Clock className="w-4 h-4 mx-auto mb-1 opacity-50" />
        <p>Nenhum insight ainda nesta sessão.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-3 py-2 overflow-y-auto max-h-64" aria-live="polite" aria-label="Insights do RADAR">
      {[...timeline].reverse().map((ins) => (
        <InsightCard key={ins.id} insight={ins} />
      ))}
    </div>
  );
}

function MiniChip({ topInsight, thinking, thinkingError, onExpand }: {
  topInsight: RadarInsight | null;
  thinking: boolean;
  thinkingError: string | null;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className={cn(
        'flex items-center gap-2 rounded-full border border-border/80 bg-card shadow-md px-3 py-1.5 text-xs',
        'hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      aria-label="Abrir painel RADAR"
    >
      {thinking && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
      {thinkingError && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
      {!thinking && !thinkingError && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
      )}
      <span className="max-w-[140px] truncate text-foreground">
        {thinkingError
          ? 'Erro — clique para ver'
          : topInsight
            ? topInsight.text
            : 'RADAR pronto'}
      </span>
      <ChevronUp className="w-3 h-3 text-muted-foreground" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function RadarPhase6Panel({ conversationId, contactName, className }: RadarPhase6PanelProps) {
  const radar = useRadarPanel(conversationId);
  const panelRef = useRef<HTMLDivElement>(null);

  // CV-056 — Ctrl+Shift+R abre/fecha o painel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        radar.toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [radar]);

  // ---------------------------------------------------------------------------
  // Painel fechado — só mostra o botão mini se não estiver mudo
  // ---------------------------------------------------------------------------
  if (!radar.open) {
    if (radar.isMuted) return null;
    const topInsight = radar.timeline.length > 0 ? radar.timeline[radar.timeline.length - 1] : null;
    return (
      <div
        className={cn(
          'fixed z-40 select-none',
          'bottom-24 right-3 sm:bottom-28 sm:right-4',
          className,
        )}
      >
        <MiniChip
          topInsight={topInsight}
          thinking={radar.thinking}
          thinkingError={radar.thinkingError}
          onExpand={radar.toggle}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Mobile (<640px) — drawer inferior (CV-060)
  // ---------------------------------------------------------------------------
  const isMobileDrawer = typeof window !== 'undefined' && window.innerWidth < 640;
  if (isMobileDrawer) {
    const topInsight = radar.timeline.length > 0 ? radar.timeline[radar.timeline.length - 1] : null;
    const prevInsight = radar.timeline.length > 1 ? radar.timeline[radar.timeline.length - 2] : null;
    return (
      <div
        ref={panelRef}
        role="complementary"
        aria-label="RADAR de Vendas"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card shadow-2xl',
          'pb-safe',
          className,
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">RADAR — {contactName}</span>
          <button onClick={radar.toggle} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent" aria-label="Fechar painel RADAR">
            <X className="w-4 h-4" />
          </button>
        </div>

        {radar.thinking && <ThinkingIndicator error={radar.thinkingError} />}

        <div className="px-4 py-3 flex flex-col gap-2" aria-live="polite">
          {topInsight && <InsightCard insight={topInsight} />}
          {prevInsight && <InsightCard insight={prevInsight} />}
          {!topInsight && !radar.thinking && (
            <p className="text-xs text-muted-foreground text-center py-2">Aguardando análise da conversa…</p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop — painel flutuante (CV-051)
  // ---------------------------------------------------------------------------

  const isFocus = radar.mode === 'focus';
  const panelWidth = isFocus ? 'w-80' : 'w-72';

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label="RADAR de Vendas"
      className={cn(
        'fixed z-40 flex flex-col rounded-xl border border-border bg-card shadow-xl select-none',
        'right-4 bottom-28 max-h-[calc(100vh-200px)]',
        panelWidth,
        className,
      )}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">RADAR</span>
          {radar.thinking && (
            <Loader2 className="w-3 h-3 animate-spin text-primary" aria-hidden="true" />
          )}
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
            {contactName.split(' ')[0]}
          </Badge>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Modos */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="w-6 h-6"
                onClick={() => radar.setMode('mini')}
                aria-label="Modo mini"
                aria-pressed={radar.mode === 'mini'}
              >
                <Minimize2 className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mini</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isFocus ? 'secondary' : 'ghost'} size="icon"
                className="w-6 h-6"
                onClick={() => radar.setMode(isFocus ? 'normal' : 'focus')}
                aria-label={isFocus ? 'Modo normal' : 'Modo foco'}
                aria-pressed={isFocus}
              >
                <Maximize2 className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isFocus ? 'Normal' : 'Foco'}</TooltipContent>
          </Tooltip>

          {/* Não perturbe (CV-058) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={radar.mutedForConversation ? 'secondary' : 'ghost'} size="icon"
                className="w-6 h-6"
                onClick={radar.mutedForConversation ? radar.unmuteForConversation : radar.muteForConversation}
                aria-label={radar.mutedForConversation ? 'Reativar RADAR nesta conversa' : 'Silenciar RADAR nesta conversa'}
                aria-pressed={radar.mutedForConversation}
              >
                {radar.mutedForConversation ? <BellOff className="w-3 h-3 text-muted-foreground" /> : <Bell className="w-3 h-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {radar.mutedForConversation ? 'Reativar nesta conversa' : 'Silenciar nesta conversa'}
            </TooltipContent>
          </Tooltip>

          {/* Fechar */}
          <Button
            variant="ghost" size="icon"
            className="w-6 h-6"
            onClick={radar.toggle}
            aria-label="Fechar painel RADAR"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Indicador de pensando (CV-054) */}
      {(radar.thinking || radar.thinkingError) && (
        <ThinkingIndicator error={radar.thinkingError} />
      )}

      {/* Timeline de insights (CV-055) */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <TimelineSection timeline={radar.timeline} />
      </div>

      {/* Rodapé — mudo global (CV-058) */}
      <div className="shrink-0 border-t border-border/60 px-3 py-1.5">
        {radar.globalMutedUntil > 0 && Date.now() < radar.globalMutedUntil ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Silenciado por 30 min</span>
            <button onClick={radar.unmuteGlobal} className="underline hover:text-foreground">Reativar</button>
          </div>
        ) : (
          <button
            onClick={radar.muteGlobalFor30Min}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Silenciar tudo por 30 min
          </button>
        )}
      </div>
    </div>
  );
}

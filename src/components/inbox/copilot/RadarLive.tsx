/**
 * Copiloto RADAR ao vivo (Fases 4–6) — contêiner do painel na Inbox.
 *
 * Junta a sessão do contato (useCopilotSession), as sugestões/próximo passo/
 * alertas do motor (useLiveSuggestions) e as preferências do painel
 * (useRadarPanel). Sem sessão não renderiza nada: com a capacidade
 * `ai.capability.copilot_live` desligada o motor não cria sessão, então a Inbox
 * fica exatamente como era. Carregado sob demanda (lazy) pelo ChatInputArea.
 *
 * Convive com o RadarPhase7Panel (ghost text, templates e voz, tudo local): aqui
 * só entra o que vem do motor de IA, então não há cartão repetido.
 */
import { useAuth } from '@/hooks/auth/useAuth';
import { useCopilotSession } from '@/hooks/copilot/useCopilotSession';
import { useLiveSuggestions } from '@/hooks/copilot/useLiveSuggestions';
import { useRadarPanel } from '@/hooks/copilot/useRadarPanel';
import { RadarPanel } from './RadarPanel';

export interface RadarLiveProps {
  contactId: string;
  onDraftText: (text: string) => void;
  className?: string;
}

export default function RadarLive({ contactId, onDraftText, className }: RadarLiveProps) {
  const { user } = useAuth();
  const { session, loading: sessionLoading, refresh: refreshSession } = useCopilotSession(contactId);
  const live = useLiveSuggestions(session?.id ?? null, refreshSession);
  const panel = useRadarPanel(user?.id, contactId);

  if (!session) return null;

  return (
    <RadarPanel
      className={className}
      mode={panel.mode}
      collapsed={panel.collapsed}
      collapsedCards={panel.collapsedCards}
      cardOrder={panel.cardOrder}
      isDnd={panel.isDnd}
      onSetMode={panel.setMode}
      onToggleCollapsed={panel.toggleCollapsed}
      onToggleCard={panel.toggleCard}
      onEnableDnd={panel.enableDnd}
      onClearDnd={panel.clearDnd}
      session={session}
      sessionLoading={sessionLoading}
      suggestions={live.suggestions}
      suggestionsLoading={live.loading}
      onUseSuggestion={onDraftText}
      onUseSplit={(parts) => onDraftText(parts.join('\n'))}
      onRefresh={() => {
        refreshSession();
        live.refresh();
      }}
      nextStep={live.nextStep}
      alerts={live.alerts}
      conversationId={contactId}
    />
  );
}

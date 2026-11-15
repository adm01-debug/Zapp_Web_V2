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
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCopilotSession } from '@/hooks/copilot/useCopilotSession';
import { useLiveSuggestions } from '@/hooks/copilot/useLiveSuggestions';
import { useRadarPanel } from '@/hooks/copilot/useRadarPanel';
import { RadarPanel } from './RadarPanel';

export interface RadarLiveProps {
  contactId: string;
  onDraftText: (text: string) => void;
  className?: string;
  /**
   * Id da ultima mensagem recebida do contato. Sinal de que a sessao do contato
   * pode ter acabado de nascer: ver o efeito de descoberta abaixo.
   */
  lastContactMessageId?: string;
}

export default function RadarLive({ contactId, onDraftText, className, lastContactMessageId }: RadarLiveProps) {
  const { user } = useAuth();
  const { session, loading: sessionLoading, refresh: refreshSession } = useCopilotSession(contactId);
  const live = useLiveSuggestions(session?.id ?? null, refreshSession);
  const panel = useRadarPanel(user?.id, contactId);

  // Sem sessao carregada nao existe assinatura de insights (useLiveSuggestions
  // exige sessionId) e `copilot_sessions` nao esta no Realtime: nada reconsulta,
  // e o painel so aparecia ao reabrir a conversa. O gatilho AFTER INSERT em
  // `messages` grava a sessao na mesma transacao da mensagem, antes de enfileirar
  // o job de IA, entao quando a mensagem chega ao cliente a linha ja existe e uma
  // consulta basta. Com sessao em maos quem avisa volta a ser o insight novo.
  // Montagem nao conta: a consulta inicial do hook ja acontece.
  const vistaNaMontagem = useRef(lastContactMessageId);
  useEffect(() => {
    if (vistaNaMontagem.current === lastContactMessageId) return;
    vistaNaMontagem.current = lastContactMessageId;
    if (!session) refreshSession();
  }, [lastContactMessageId, session, refreshSession]);

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
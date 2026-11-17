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

  // CV-055: cada sugestao nova do motor entra no historico da conversa. Sem isto o
  // painel so mostra a rodada atual e o que a IA disse antes se perde da tela.
  // `isDnd` e `pushInsight` saem do objeto ANTES do effect: com `panel.x` nas
  // dependencias o react-hooks/exhaustive-deps exige o objeto `panel` inteiro, que
  // muda a cada render e refaria o push sem necessidade.
  // Revisao do Devin na #3222: registra TODAS as sugestoes da rodada, nao so a
  // primeira. Uma rodada expoe ate tres (splitInsights, em useLiveSuggestions);
  // guardar so a primeira perdia as outras duas, que o atendente tinha visto.
  const sugestoes = live.suggestions;
  const { isDnd, pushInsight } = panel;
  useEffect(() => {
    if (isDnd) return;
    for (const sugestao of sugestoes) {
      if (sugestao?.text) pushInsight(sugestao.text, sugestao.id);
    }
  }, [sugestoes, isDnd, pushInsight]);

  if (!session) return null;

  // "Antes nesta conversa" = o que JA saiu de cena. O que ainda esta no painel nao
  // se repete aqui. O bloco e renderizado DENTRO do RadarPanel: no desktop o painel
  // e `position: fixed` e arrastavel, entao como irmao no ChatInputArea o historico
  // ficava preso a caixa de digitacao (revisao do Devin e do Codex na #3222).
  const idsNoPainel = new Set(sugestoes.map((sugestao) => sugestao.id));
  const historico = panel.timeline
    .filter((insight) => !insight.messageId || !idsNoPainel.has(insight.messageId))
    .slice(-4)
    .reverse();

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
      historico={historico}
    />
  );
}

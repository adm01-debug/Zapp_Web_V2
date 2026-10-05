import {
  useActiveTeamChatConversationId,
  useTeamChatNotifications,
} from '@/hooks/chat/useTeamChatNotifications';

/**
 * TC-007 — listener ÚNICO de notificações do Team Chat, montado no nível do app.
 *
 * Antes o hook era chamado só dentro de `TeamChatView`: com o módulo fechado (ex.: tela de
 * Contatos) o atendente não recebia alerta nenhum. Aqui ele assina em todo o app e a conversa
 * em foco — que deve ser silenciada enquanto está na tela — chega pelo store compartilhado,
 * para não existir um segundo canal duplicado dentro da view.
 *
 * Renderiza `null`: é puramente um portador de efeito.
 */
export function TeamChatNotificationsListener() {
  const activeConversationId = useActiveTeamChatConversationId();
  useTeamChatNotifications(activeConversationId);
  return null;
}

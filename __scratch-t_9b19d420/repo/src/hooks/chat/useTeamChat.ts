// Re-export all team chat hooks and types from modular files
export type { TeamConversation, TeamMember, TeamMessage } from '../team-chat/teamChatTypes';
export { useTeamConversations } from '../team-chat/useTeamConversations';
export { useTeamMessages } from '../team-chat/useTeamMessages';
export {
  useSendTeamMessage,
  useDeleteTeamMessage,
  useEditTeamMessage,
  useCreateTeamConversation,
  useToggleMuteConversation,
} from '../team-chat/useTeamChatMutations';

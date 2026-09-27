/** E96: PT-BR string catalog for Team Chat module. */
export const teamChatStrings = {
  // Navigation / header
  title: 'Chat de Equipe',
  newConversation: 'Nova conversa',
  searchConversations: 'Buscar conversas…',

  // Channel types
  departmentChannel: 'Canal de departamento',
  directMessage: 'Mensagem direta',
  groupConversation: 'Grupo',

  // Participant status
  online: 'Online',
  away: 'Ausente',
  offline: 'Offline',
  membersOnline: (n: number) => `${n} ${n === 1 ? 'membro' : 'membros'} online`,

  // Typing
  typing: 'digitando…',
  typingMultiple: (names: string[]) => `${names.join(', ')} estão digitando…`,

  // Input area
  messagePlaceholder: 'Digite uma mensagem…',
  sendMessage: 'Enviar mensagem',
  recordAudio: 'Gravar áudio',
  stopRecording: 'Parar gravação',
  attachFile: 'Anexar arquivo',
  sendSticker: 'Enviar sticker',

  // Message actions
  reply: 'Responder',
  edit: 'Editar',
  delete: 'Excluir',
  copy: 'Copiar texto',
  react: 'Reagir',
  forward: 'Encaminhar',

  // Message status
  messageSent: 'Enviada',
  messageDelivered: 'Entregue',
  messageRead: 'Lida',
  messageFailed: 'Falhou',

  // Access control
  restrictedChannel: 'Conteúdo Protegido',
  restrictedChannelDescription:
    'Este canal é exclusivo para membros do departamento. Solicite um convite ao administrador.',

  // Invites
  inviteAccepted: 'Convite aceito com sucesso.',
  inviteExpired: 'Este convite expirou ou já foi utilizado.',
  inviteInvalid: 'Convite inválido.',

  // Analytics
  analyticsTitle: 'Desempenho da conversa',
  totalMessages: 'Mensagens',
  activeParticipants: 'Participantes ativos',
  avgResponseTime: 'Resposta média',
  exportData: 'Exportar dados',

  // Unread
  unreadMessages: (n: number) => `${n} ${n === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`,
  markAsRead: 'Marcar como lida',

  // Notifications
  notificationPermissionPrompt: 'Ativar notificações para este chat?',
  notificationEnabled: 'Notificações ativadas.',
  newMessageNotification: (sender: string) => `Nova mensagem de ${sender}`,

  // Errors
  errorLoadingMessages: 'Erro ao carregar mensagens. Tente novamente.',
  errorSendingMessage: 'Não foi possível enviar a mensagem.',
  errorLoadingConversations: 'Erro ao carregar conversas.',
} as const;

export type TeamChatStringKey = keyof typeof teamChatStrings;

import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // Chat shortcuts
  { id: 'send-message', name: 'Enviar mensagem', description: 'Envia a mensagem atual', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'ai-suggestions', name: 'Sugestões de IA', description: 'Abre o painel de sugestões de IA', defaultKey: 'i', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'templates', name: 'Templates', description: 'Abre o menu de templates', defaultKey: 't', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'focus-input', name: 'Focar no campo', description: 'Move o foco para o campo de mensagem', defaultKey: '/', defaultModifiers: {}, category: 'chat' },
  { id: 'emoji-picker', name: 'Seletor de Emoji', description: 'Abre o seletor de emojis', defaultKey: 'e', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'attach-file', name: 'Anexar arquivo', description: 'Abre o seletor de arquivos', defaultKey: 'u', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  // Navigation shortcuts
  { id: 'global-search', name: 'Busca global', description: 'Abre a busca global', defaultKey: 'k', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'next-conversation', name: 'Próxima conversa', description: 'Navega para a próxima conversa', defaultKey: 'ArrowDown', defaultModifiers: { altKey: true }, category: 'navigation' },
  { id: 'prev-conversation', name: 'Conversa anterior', description: 'Navega para a conversa anterior', defaultKey: 'ArrowUp', defaultModifiers: { altKey: true }, category: 'navigation' },
  { id: 'show-shortcuts-help', name: 'Ajuda de atalhos', description: 'Mostra todos os atalhos disponíveis', defaultKey: '/', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'toggle-sidebar', name: 'Alternar barra lateral', description: 'Mostra ou oculta a barra lateral', defaultKey: 'b', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'go-to-inbox', name: 'Ir para Inbox', description: 'Navega para a caixa de entrada', defaultKey: '1', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'go-to-dashboard', name: 'Ir para Dashboard', description: 'Navega para o painel principal', defaultKey: '2', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  // Action shortcuts
  { id: 'mark-resolved', name: 'Marcar como resolvido', description: 'Marca a conversa atual como resolvida', defaultKey: 'r', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' },
  { id: 'transfer-chat', name: 'Transferir chat', description: 'Abre o diálogo de transferência', defaultKey: 't', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' },
  { id: 'archive-chat', name: 'Arquivar chat', description: 'Arquiva a conversa selecionada', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions' },
  { id: 'pin-conversation', name: 'Fixar conversa', description: 'Fixa ou desfixa a conversa', defaultKey: 'p', defaultModifiers: { ctrlKey: true }, category: 'actions' },
  { id: 'mute-conversation', name: 'Silenciar conversa', description: 'Silencia notificações da conversa', defaultKey: 'm', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' },
  { id: 'new-message', name: 'Nova mensagem', description: 'Inicia uma nova conversa', defaultKey: 'n', defaultModifiers: { ctrlKey: true }, category: 'actions' },
  { id: 'refresh-data', name: 'Atualizar dados', description: 'Recarrega os dados da página', defaultKey: 'r', defaultModifiers: { ctrlKey: true }, category: 'actions' },
  // Selection shortcuts
  { id: 'select-all', name: 'Selecionar tudo', description: 'Seleciona todas as conversas', defaultKey: 'a', defaultModifiers: { ctrlKey: true }, category: 'selection' },
  { id: 'clear-selection', name: 'Limpar seleção', description: 'Remove a seleção atual', defaultKey: 'Escape', defaultModifiers: {}, category: 'selection' },
  { id: 'mark-read', name: 'Marcar como lido', description: 'Marca selecionados como lidos', defaultKey: 'r', defaultModifiers: {}, category: 'selection' },
  { id: 'bulk-archive', name: 'Arquivar selecionados', description: 'Arquiva todas as conversas selecionadas', defaultKey: 'e', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'selection' },
];

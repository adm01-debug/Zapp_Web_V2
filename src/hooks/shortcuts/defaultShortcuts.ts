import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';

/**
 * Etapa 77: rotas que montam o módulo de Tarefas. Etapa E09: só `?view=tasks` —
 * o Quadro passou a ser um modo DENTRO de Tarefas (`tasks-mode`), então a antiga
 * view `pipeline` deixou de valer.
 * É o escopo dos 7 atalhos abaixo — fora dessa view o registry os ignora.
 */
export const TASKS_VIEWS = ['tasks'];

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // Chat shortcuts
  { id: 'send-message', name: 'Enviar mensagem', description: 'Envia a mensagem atual', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'ai-suggestions', name: 'Sugestões de IA', description: 'Abre o painel de sugestões de IA', defaultKey: 'i', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'templates', name: 'Templates', description: 'Abre o menu de templates', defaultKey: 't', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'focus-input', name: 'Focar no campo', description: 'Move o foco para o campo de mensagem', defaultKey: '/', defaultModifiers: {}, category: 'chat' },
  { id: 'emoji-picker', name: 'Seletor de Emoji', description: 'Abre o seletor de emojis', defaultKey: 'e', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'attach-file', name: 'Anexar arquivo', description: 'Abre o seletor de arquivos', defaultKey: 'u', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'audio-toggle-mute', name: 'Silenciar áudio em reprodução', description: 'Silencia ou retoma o áudio que está tocando', defaultKey: 'm', defaultModifiers: {}, category: 'chat' },
  // Navigation shortcuts
  { id: 'global-search', name: 'Busca global', description: 'Abre a busca global', defaultKey: 'k', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'next-conversation', name: 'Próxima conversa', description: 'Navega para a próxima conversa', defaultKey: 'ArrowDown', defaultModifiers: { altKey: true }, category: 'navigation' },
  { id: 'prev-conversation', name: 'Conversa anterior', description: 'Navega para a conversa anterior', defaultKey: 'ArrowUp', defaultModifiers: { altKey: true }, category: 'navigation' },
  { id: 'open-tasks-tab', name: 'Tarefas da conversa', description: 'Abre a aba Tarefas com o foco no campo de nova tarefa', defaultKey: 't', defaultModifiers: { altKey: true }, category: 'navigation' },
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
  // Task shortcuts (etapa 77)
  { id: 'tasks-focus-quickadd', defaultKey: 'n', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-mode', defaultKey: '1', alternateKeys: ['2', '3'], defaultModifiers: {}, category: 'navigation', scope: TASKS_VIEWS },
  { id: 'tasks-search', defaultKey: '/', defaultModifiers: {}, category: 'navigation', scope: TASKS_VIEWS },
  { id: 'tasks-open-sheet', defaultKey: 'e', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-complete', defaultKey: 'x', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-cancel', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-help', defaultKey: '?', defaultModifiers: { shiftKey: true }, category: 'navigation', scope: TASKS_VIEWS },
  // RADAR copiloto (CV-056) — atalhos do painel de sugestões ao vivo
  { id: 'radar-toggle', name: 'Abrir/fechar RADAR', description: 'Expande ou recolhe o painel RADAR', defaultKey: 'L', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'chat' },
  { id: 'radar-use-1', name: 'Usar sugestão 1', description: 'Aplica a primeira sugestão do RADAR na caixa de digitação', defaultKey: '1', defaultModifiers: { ctrlKey: true, altKey: true }, category: 'chat' },
  { id: 'radar-use-2', name: 'Usar sugestão 2', description: 'Aplica a segunda sugestão do RADAR na caixa de digitação', defaultKey: '2', defaultModifiers: { ctrlKey: true, altKey: true }, category: 'chat' },
  { id: 'radar-use-3', name: 'Usar sugestão 3', description: 'Aplica a terceira sugestão do RADAR na caixa de digitação', defaultKey: '3', defaultModifiers: { ctrlKey: true, altKey: true }, category: 'chat' },
  { id: 'radar-next-card', name: 'Próximo cartão RADAR', description: 'Move o foco para o próximo cartão do painel RADAR', defaultKey: ']', defaultModifiers: { ctrlKey: true }, category: 'chat' },
];

export const SHORTCUTS_SOMENTE_INFORMATIVOS: readonly string[] = [
  'send-message',
  'ai-suggestions',
  'templates',
  'focus-input',
  'emoji-picker',
  'attach-file',
  'next-conversation',
  'prev-conversation',
  'mark-resolved',
  'transfer-chat',
  'archive-chat',
  'pin-conversation',
  'mute-conversation',
  'new-message',
  // RADAR (CV-056) — sem executor global ainda; cada instância de RadarPanel captura por conta
  'radar-toggle',
  'radar-use-1',
  'radar-use-2',
  'radar-use-3',
  'radar-next-card',
  'select-all',
  'clear-selection',
  'mark-read',
  'bulk-archive',
];

export function listarAtalhosEditaveis<T extends { id: string }>(shortcuts: T[]): T[] {
  return shortcuts.filter((shortcut) => !SHORTCUTS_SOMENTE_INFORMATIVOS.includes(shortcut.id));
}
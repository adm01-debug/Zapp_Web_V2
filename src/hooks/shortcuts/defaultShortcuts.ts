import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';

/**
 * Etapa 77: rotas que montam o módulo de Tarefas. Etapa E09: só `?view=tasks` —
 * o Quadro passou a ser um modo DENTRO de Tarefas (`tasks-mode`), então a antiga
 * view `pipeline` deixou de valer.
 * É o escopo dos 7 atalhos abaixo — fora dessa view o registry os ignora.
 */
export const TASKS_VIEWS = ['tasks'];

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // Chat shortcuts.
  // t_8e895114: `ai-suggestions`, `templates`, `focus-input`, `emoji-picker` e
  // `attach-file` saíram daqui. Eram anunciados no painel de ajuda e remapeáveis
  // na tela de configurações, mas NENHUM tratador existia (nem no registry, nem
  // no ChatPanel) — anunciar tecla que não faz nada é pior que não anunciar.
  // `send-message` fica: o compositor escuta Ctrl+Enter no próprio campo.
  { id: 'send-message', name: 'Enviar mensagem', description: 'Envia a mensagem atual', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  // Navigation shortcuts
  { id: 'global-search', name: 'Busca global', description: 'Abre a busca global', defaultKey: 'k', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'open-tasks-tab', name: 'Tarefas da conversa', description: 'Abre a aba Tarefas com o foco no campo de nova tarefa', defaultKey: 't', defaultModifiers: { altKey: true }, category: 'navigation' },
  { id: 'show-shortcuts-help', name: 'Ajuda de atalhos', description: 'Mostra todos os atalhos disponíveis', defaultKey: '/', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'toggle-sidebar', name: 'Alternar barra lateral', description: 'Mostra ou oculta a barra lateral', defaultKey: 'b', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'go-to-inbox', name: 'Ir para Inbox', description: 'Navega para a caixa de entrada', defaultKey: '1', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  { id: 'go-to-dashboard', name: 'Ir para Dashboard', description: 'Navega para o painel principal', defaultKey: '2', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
  // Action shortcuts.
  // t_8e895114: `mark-resolved`, `archive-chat`, `pin-conversation`,
  // `mute-conversation` e `new-message` saíram pelo mesmo motivo dos de chat —
  // nenhuma dessas ações existe hoje na inbox. `transfer-chat` fica e ganhou
  // tratador (abre o TransferDialog pelo mesmo evento que o painel do contato).
  { id: 'transfer-chat', name: 'Transferir chat', description: 'Abre o diálogo de transferência', defaultKey: 't', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' },
  { id: 'refresh-data', name: 'Atualizar dados', description: 'Recarrega os dados da página', defaultKey: 'r', defaultModifiers: { ctrlKey: true }, category: 'actions' },
  // Selection shortcuts.
  // t_8e895114: `select-all` (Ctrl+A) e `mark-read` (R) saíram — nenhuma das
  // duas tinha tratador. `clear-selection` (Escape) e `bulk-archive` (Delete)
  // ficam porque o RealtimeInboxView já os consome no próprio listener quando o
  // modo de seleção está ligado (limpa a seleção / arquiva os selecionados).
  { id: 'clear-selection', name: 'Limpar seleção', description: 'Remove a seleção atual', defaultKey: 'Escape', defaultModifiers: {}, category: 'selection' },
  { id: 'bulk-archive', name: 'Arquivar selecionados', description: 'Arquiva todas as conversas selecionadas', defaultKey: 'Delete', defaultModifiers: {}, category: 'selection' },
  // Task shortcuts (etapa 77) — valem só em `?view=tasks` (E09: a antiga view
  // `pipeline` saiu do escopo; o Quadro é um modo de Tarefas).
  // O módulo recebe o comando pelo evento `tasks-shortcut` (o registry não
  // conhece o estado de tela do módulo); a guarda de input é a do handler
  // global, que ignora qualquer um destes ids dentro de INPUT/TEXTAREA.
  //
  // Etapa 84: o `name`/`description` destes 7 NÃO entra aqui de propósito. Os
  // textos vivem em `taskShortcutLabels.ts`, carregado sob demanda pelo painel
  // de ajuda e pela tela de atalhos (`useTaskShortcutLabels`); mantê-los neste
  // arquivo (eager) estourava o budget `initial-js` (340 KB). O que o registry
  // precisa — id, tecla, modificadores, categoria e escopo — continua aqui.
  { id: 'tasks-focus-quickadd', defaultKey: 'n', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-mode', defaultKey: '1', alternateKeys: ['2', '3'], defaultModifiers: {}, category: 'navigation', scope: TASKS_VIEWS },
  { id: 'tasks-search', defaultKey: '/', defaultModifiers: {}, category: 'navigation', scope: TASKS_VIEWS },
  { id: 'tasks-open-sheet', defaultKey: 'e', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-complete', defaultKey: 'x', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-cancel', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions', scope: TASKS_VIEWS },
  { id: 'tasks-help', defaultKey: '?', defaultModifiers: { shiftKey: true }, category: 'navigation', scope: TASKS_VIEWS },
];

import {
  ArrowRight, CheckCircle, FileText, StickyNote, Tag, AlertTriangle,
  Users, Clock, Star, Archive, Bell, Zap, MessageSquare, Package,
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  command: string;
  label: string;
  description: string;
  icon: typeof ArrowRight;
  category: 'actions' | 'templates' | 'notes' | 'tags' | 'priority';
  color: string;
  shortcut?: string;
  subCommands?: { id: string; label: string; value: string }[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'transfer', command: '/transfer', label: 'Transferir', description: 'Transferir conversa para outro agente ou fila', icon: ArrowRight, category: 'actions', color: 'text-info', shortcut: 'T', subCommands: [{ id: 'agent', label: 'Para Agente', value: 'agent' }, { id: 'queue', label: 'Para Fila', value: 'queue' }] },
  { id: 'resolve', command: '/resolve', label: 'Resolver', description: 'Marcar conversa como resolvida', icon: CheckCircle, category: 'actions', color: 'text-success', shortcut: 'R' },
  { id: 'template', command: '/template', label: 'Template', description: 'Inserir um template de mensagem', icon: FileText, category: 'templates', color: 'text-primary', shortcut: 'M' },
  { id: 'note', command: '/note', label: 'Nota', description: 'Adicionar nota privada à conversa', icon: StickyNote, category: 'notes', color: 'text-warning', shortcut: 'N' },
  { id: 'tag', command: '/tag', label: 'Tag', description: 'Adicionar ou remover tags', icon: Tag, category: 'tags', color: 'text-info', shortcut: 'G', subCommands: [{ id: 'add', label: 'Adicionar Tag', value: 'add' }, { id: 'remove', label: 'Remover Tag', value: 'remove' }] },
  { id: 'priority', command: '/priority', label: 'Prioridade', description: 'Definir prioridade da conversa', icon: AlertTriangle, category: 'priority', color: 'text-warning', shortcut: 'P', subCommands: [{ id: 'high', label: '🔴 Alta', value: 'high' }, { id: 'medium', label: '🟡 Média', value: 'medium' }, { id: 'low', label: '🟢 Baixa', value: 'low' }] },
  { id: 'assign', command: '/assign', label: 'Atribuir', description: 'Atribuir conversa a um agente', icon: Users, category: 'actions', color: 'text-primary', shortcut: 'A' },
  { id: 'snooze', command: '/snooze', label: 'Adiar', description: 'Adiar conversa para depois', icon: Clock, category: 'actions', color: 'text-muted-foreground', shortcut: 'S', subCommands: [{ id: '1h', label: 'Em 1 hora', value: '1h' }, { id: '3h', label: 'Em 3 horas', value: '3h' }, { id: 'tomorrow', label: 'Amanhã', value: 'tomorrow' }, { id: 'nextweek', label: 'Próxima semana', value: 'nextweek' }] },
  { id: 'star', command: '/star', label: 'Favoritar', description: 'Marcar conversa como favorita', icon: Star, category: 'actions', color: 'text-warning', shortcut: 'F' },
  { id: 'archive', command: '/archive', label: 'Arquivar', description: 'Arquivar esta conversa', icon: Archive, category: 'actions', color: 'text-muted-foreground', shortcut: 'Q' },
  { id: 'remind', command: '/remind', label: 'Lembrete', description: 'Criar lembrete para esta conversa', icon: Bell, category: 'actions', color: 'text-destructive', shortcut: 'L' },
  { id: 'quick', command: '/quick', label: 'Resposta Rápida', description: 'Usar uma resposta rápida salva', icon: Zap, category: 'templates', color: 'text-success', shortcut: 'K' },
  { id: 'summary', command: '/summary', label: 'Resumo IA', description: 'Gerar resumo da conversa com IA', icon: MessageSquare, category: 'actions', color: 'text-accent', shortcut: 'I' },
  { id: 'produto', command: '/produto', label: 'Catálogo', description: 'Buscar e enviar produto do catálogo', icon: Package, category: 'actions', color: 'text-success', shortcut: 'C' },
];

export const categoryColors: Record<string, string> = {
  actions: 'bg-info/10 text-info',
  templates: 'bg-primary/10 text-primary',
  notes: 'bg-warning/10 text-warning',
  tags: 'bg-info/10 text-info',
  priority: 'bg-warning/10 text-warning',
};

export const categoryLabels: Record<string, string> = {
  actions: 'Ações',
  templates: 'Templates',
  notes: 'Notas',
  tags: 'Tags',
  priority: 'Prioridade',
};

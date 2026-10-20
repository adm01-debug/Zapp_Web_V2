import * as React from 'react';
import {
  MessageSquare, Users, BarChart3, Phone, Tag, Inbox,
  FileText, Bell, Search, Plus, Upload, Link2, UserPlus,
  Settings, Wand2, RefreshCw, Filter, Zap, HelpCircle,
} from 'lucide-react';

export interface ContextAction {
  label: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  external?: boolean;
}

export interface ContextConfig {
  icon: React.ElementType;
  title: string;
  description: string;
  primaryAction: { label: string; icon: React.ReactNode };
  secondaryAction?: { label: string; icon: React.ReactNode };
  tertiaryAction?: { label: string; icon: React.ReactNode };
  helpText?: string;
}

export const contextConfigs: Record<string, ContextConfig> = {
  inbox: {
    icon: Inbox,
    title: 'Nenhuma conversa ainda',
    description: 'Conecte seu WhatsApp ou importe contatos para começar a atender.',
    primaryAction: { label: 'Conectar WhatsApp', icon: <Link2 className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Importar contatos', icon: <Upload className="w-4 h-4 mr-2" /> },
    tertiaryAction: { label: 'Ver como funciona', icon: <HelpCircle className="w-4 h-4 mr-2" /> },
    helpText: 'Após conectar, as mensagens aparecerão automaticamente aqui.',
  },
  contacts: {
    icon: Users,
    title: 'Nenhum contato cadastrado',
    description: 'Adicione contatos manualmente ou importe de uma planilha.',
    primaryAction: { label: 'Adicionar contato', icon: <UserPlus className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Importar planilha', icon: <Upload className="w-4 h-4 mr-2" /> },
    helpText: 'Contatos também são criados automaticamente ao receber mensagens.',
  },
  queues: {
    icon: Inbox,
    title: 'Nenhuma fila criada',
    description: 'Crie filas para organizar o atendimento por departamento ou assunto.',
    primaryAction: { label: 'Criar primeira fila', icon: <Plus className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Usar wizard', icon: <Wand2 className="w-4 h-4 mr-2" /> },
    helpText: 'Filas ajudam a distribuir conversas entre agentes de forma organizada.',
  },
  agents: {
    icon: Users,
    title: 'Nenhum agente na equipe',
    description: 'Convide membros da sua equipe para atender conversas.',
    primaryAction: { label: 'Convidar agente', icon: <UserPlus className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Configurar permissões', icon: <Settings className="w-4 h-4 mr-2" /> },
    helpText: 'Agentes podem atender conversas nas filas que você atribuir.',
  },
  tags: {
    icon: Tag,
    title: 'Nenhuma etiqueta criada',
    description: 'Etiquetas ajudam a organizar e filtrar conversas rapidamente.',
    primaryAction: { label: 'Criar etiqueta', icon: <Plus className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Importar etiquetas', icon: <Upload className="w-4 h-4 mr-2" /> },
    helpText: 'Use cores diferentes para identificar categorias visualmente.',
  },
  transcriptions: {
    icon: FileText,
    title: 'Nenhuma transcrição disponível',
    description: 'Transcrições são geradas automaticamente para áudios recebidos.',
    primaryAction: { label: 'Ativar transcrição automática', icon: <Zap className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Configurações', icon: <Settings className="w-4 h-4 mr-2" /> },
    helpText: 'Habilite nas configurações para transcrever áudios automaticamente.',
  },
  dashboard: {
    icon: BarChart3,
    title: 'Sem dados para exibir',
    description: 'Comece a atender para ver métricas e insights sobre seu desempenho.',
    primaryAction: { label: 'Ir para Inbox', icon: <Inbox className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Configurar metas', icon: <Settings className="w-4 h-4 mr-2" /> },
    helpText: 'Métricas são calculadas com base nas conversas atendidas.',
  },
  search: {
    icon: Search,
    title: 'Nenhum resultado encontrado',
    description: 'Tente usar termos diferentes ou verificar a ortografia.',
    primaryAction: { label: 'Limpar filtros', icon: <RefreshCw className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Busca avançada', icon: <Filter className="w-4 h-4 mr-2" /> },
    helpText: 'Você pode buscar por nome, telefone, email ou conteúdo de mensagens.',
  },
  notifications: {
    icon: Bell,
    title: 'Você está em dia!',
    description: 'Nenhuma notificação no momento.',
    primaryAction: { label: 'Configurar alertas', icon: <Settings className="w-4 h-4 mr-2" /> },
    helpText: 'Configure quais notificações você deseja receber.',
  },
  calls: {
    icon: Phone,
    title: 'Nenhuma ligação registrada',
    description: 'O histórico de chamadas aparecerá aqui.',
    primaryAction: { label: 'Configurar VoIP', icon: <Settings className="w-4 h-4 mr-2" /> },
    helpText: 'Integre com seu sistema de telefonia para registrar chamadas.',
  },
  wallet: {
    icon: Users,
    title: 'Nenhum cliente na carteira',
    description: 'Configure regras para distribuir clientes entre agentes.',
    primaryAction: { label: 'Criar regra', icon: <Plus className="w-4 h-4 mr-2" /> },
    secondaryAction: { label: 'Importar distribuição', icon: <Upload className="w-4 h-4 mr-2" /> },
    helpText: 'Carteiras garantem que cada cliente seja atendido pelo mesmo agente.',
  },
  messages: {
    icon: MessageSquare,
    title: 'Selecione uma conversa',
    description: 'Escolha uma conversa ao lado para ver as mensagens.',
    primaryAction: { label: 'Ver todas conversas', icon: <Inbox className="w-4 h-4 mr-2" /> },
    helpText: 'Use os filtros para encontrar conversas específicas.',
  },
};

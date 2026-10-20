import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Users,
  Megaphone,
  Bot,
  Kanban,
  BarChart3,
  Plug,
  Inbox,
  FileText,
  Package,
  Search,
  Plus,
  type LucideIcon,
} from 'lucide-react';

interface EmptyStateProps {
  /** Which module this empty state is for */
  variant?: keyof typeof emptyStateConfigs;
  /** Custom icon override */
  icon?: LucideIcon;
  /** Custom title override */
  title?: string;
  /** Custom description override */
  description?: string;
  /** CTA button text */
  actionLabel?: string;
  /** CTA click handler */
  onAction?: () => void;
  /** Secondary action */
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  /** Extra classNames */
  className?: string;
}

const emptyStateConfigs = {
  inbox: {
    icon: Inbox,
    title: 'Nenhuma conversa ainda',
    description: 'Quando seus clientes enviarem mensagens, elas aparecerão aqui.',
    actionLabel: 'Conectar WhatsApp',
    gradient: 'from-primary/20 to-info/20',
  },
  contacts: {
    icon: Users,
    title: 'Nenhum contato encontrado',
    description: 'Comece adicionando seus primeiros contatos ou importe uma lista.',
    actionLabel: 'Adicionar Contato',
    gradient: 'from-info/20 to-success/20',
  },
  campaigns: {
    icon: Megaphone,
    title: 'Nenhuma campanha criada',
    description: 'Crie campanhas para engajar seus contatos em escala.',
    actionLabel: 'Nova Campanha',
    gradient: 'from-warning/20 to-primary/20',
  },
  chatbot: {
    icon: Bot,
    title: 'Nenhum fluxo configurado',
    description: 'Automatize o atendimento criando fluxos de chatbot inteligentes.',
    actionLabel: 'Criar Fluxo',
    gradient: 'from-primary/20 to-secondary/20',
  },
  pipeline: {
    icon: Kanban,
    title: 'Pipeline vazio',
    description: 'Gerencie suas oportunidades de venda movendo deals entre etapas.',
    actionLabel: 'Criar Deal',
    gradient: 'from-success/20 to-primary/20',
  },
  reports: {
    icon: BarChart3,
    title: 'Sem dados para exibir',
    description: 'Os relatórios serão gerados automaticamente conforme sua equipe atender.',
    gradient: 'from-info/20 to-primary/20',
  },
  integrations: {
    icon: Plug,
    title: 'Nenhuma integração ativa',
    description: 'Conecte ferramentas externas para potencializar seu atendimento.',
    actionLabel: 'Explorar Integrações',
    gradient: 'from-secondary/20 to-info/20',
  },
  templates: {
    icon: FileText,
    title: 'Nenhum template criado',
    description: 'Crie templates de mensagem para agilizar suas respostas.',
    actionLabel: 'Criar Template',
    gradient: 'from-primary/20 to-warning/20',
  },
  catalog: {
    icon: Package,
    title: 'Catálogo vazio',
    description: 'Adicione produtos e serviços para compartilhar com seus clientes.',
    actionLabel: 'Adicionar Produto',
    gradient: 'from-success/20 to-warning/20',
  },
  search: {
    icon: Search,
    title: 'Nenhum resultado encontrado',
    description: 'Tente ajustar os filtros ou usar termos de busca diferentes.',
    gradient: 'from-muted/40 to-muted/20',
  },
  generic: {
    icon: Inbox,
    title: 'Nada por aqui',
    description: 'Este módulo está vazio. Comece criando seu primeiro item.',
    actionLabel: 'Começar',
    gradient: 'from-primary/15 to-muted/20',
  },
} as const;

const floatAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: 'easeInOut' as const,
  },
};

export function EmptyState({
  variant = 'generic',
  icon: IconOverride,
  title: titleOverride,
  description: descOverride,
  actionLabel: actionOverride,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  className,
}: EmptyStateProps) {
  const config = emptyStateConfigs[variant];
  const Icon = IconOverride || config.icon;
  const title = titleOverride || config.title;
  const description = descOverride || config.description;
  const actionLabel = actionOverride || ('actionLabel' in config ? config.actionLabel : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto',
        className
      )}
    >
      {/* Floating icon with gradient background */}
      <motion.div
        animate={floatAnimation}
        className={cn(
          'w-20 h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-6 shadow-lg',
          config.gradient
        )}
      >
        <Icon className="w-9 h-9 text-primary" strokeWidth={1.5} />
      </motion.div>

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>

      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-sm">
        {description}
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {actionLabel && onAction && (
          <Button onClick={onAction} size="default" className="gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondaryAction && (
          <Button variant="outline" onClick={onSecondaryAction} size="default">
            {secondaryLabel}
          </Button>
        )}
      </div>

      {/* Decorative dots */}
      <div className="flex items-center gap-1.5 mt-8 opacity-30">
        <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0.3s' }} />
        <div className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: '0.6s' }} />
      </div>
    </motion.div>
  );
}
import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { 
  MessageSquare, Users, BarChart3, Phone, Tag, Inbox,
  FileText, Bell, Search, Plus, ArrowRight, Sparkles
} from 'lucide-react';
import { illustrations } from './empty-state-illustrations';

// Icon mapping for fallback
const contextIcons = {
  inbox: MessageSquare,
  contacts: Users,
  dashboard: BarChart3,
  calls: Phone,
  tags: Tag,
  search: Search,
  notifications: Bell,
  generic: Inbox,
  transcriptions: FileText,
};

export type EmptyStateContext = keyof typeof illustrations;

interface EmptyStateProps {
  context?: EmptyStateContext;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  context = 'generic',
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  const Icon = contextIcons[context as keyof typeof contextIcons] || Inbox;
  const illustration = illustrations[context] || illustrations.generic;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-6' : 'p-8 md:p-12',
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className={cn('relative mb-6', compact ? 'w-32 h-24' : 'w-48 h-36 md:w-56 md:h-44')}
      >
        {illustration}
        <div className="absolute inset-0 -z-10 blur-3xl">
          <div className="w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 rounded-full" />
        </div>
      </motion.div>

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        className={cn('flex items-center justify-center rounded-2xl mb-4', compact ? 'w-12 h-12' : 'w-14 h-14')}
        style={{ background: 'var(--gradient-primary)' }}
      >
        <Icon className={cn('text-primary-foreground', compact ? 'w-6 h-6' : 'w-7 h-7')} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={cn('font-display font-semibold text-foreground mb-2', compact ? 'text-lg' : 'text-xl md:text-2xl')}
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={cn('text-muted-foreground max-w-md mb-6', compact ? 'text-sm' : 'text-base')}
      >
        {description}
      </motion.p>

      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          {action && (
            <Button
              onClick={action.onClick}
              className="group shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {action.icon || <Plus className="w-4 h-4 mr-2" />}
              {action.label}
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick} className="text-muted-foreground hover:text-foreground">
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// Preset empty states
export function InboxEmptyState({ onStartChat }: { onStartChat?: () => void }) {
  return (
    <EmptyState context="inbox" title="Nenhuma conversa ainda"
      description="Suas conversas aparecerão aqui. Comece a atender clientes ou aguarde novas mensagens."
      action={onStartChat ? { label: 'Iniciar conversa', onClick: onStartChat, icon: <MessageSquare className="w-4 h-4 mr-2" /> } : undefined}
    />
  );
}

export function ContactsEmptyState({ onAddContact }: { onAddContact?: () => void }) {
  return (
    <EmptyState context="contacts" title="Nenhum contato cadastrado"
      description="Adicione contatos para gerenciar suas conversas e manter o histórico organizado."
      action={onAddContact ? { label: 'Adicionar contato', onClick: onAddContact, icon: <Users className="w-4 h-4 mr-2" /> } : undefined}
    />
  );
}

export function DashboardEmptyState({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState context="dashboard" title="Sem dados para exibir"
      description="Comece a atender para ver métricas e insights sobre seu desempenho aqui."
      action={onExplore ? { label: 'Ir para Inbox', onClick: onExplore, icon: <Sparkles className="w-4 h-4 mr-2" /> } : undefined}
    />
  );
}

export function SearchEmptyState({ query }: { query?: string }) {
  return (
    <EmptyState context="search"
      title={query ? `Nenhum resultado para "${query}"` : 'Busque por algo'}
      description={query ? 'Tente usar termos diferentes ou verificar a ortografia.' : 'Digite palavras-chave para encontrar conversas, contatos ou mensagens.'}
    />
  );
}

export function NotificationsEmptyState() {
  return <EmptyState context="notifications" title="Você está em dia!" description="Nenhuma notificação no momento. Novas atualizações aparecerão aqui." compact />;
}

export function TagsEmptyState({ onCreateTag }: { onCreateTag?: () => void }) {
  return (
    <EmptyState context="tags" title="Nenhuma etiqueta criada"
      description="Crie etiquetas para organizar e categorizar suas conversas e contatos."
      action={onCreateTag ? { label: 'Criar etiqueta', onClick: onCreateTag, icon: <Tag className="w-4 h-4 mr-2" /> } : undefined}
    />
  );
}

export function CallsEmptyState() {
  return <EmptyState context="calls" title="Nenhuma ligação registrada" description="O histórico de chamadas aparecerá aqui quando você fizer ou receber ligações." />;
}

export function TranscriptionsEmptyState() {
  return <EmptyState context="generic" title="Nenhuma transcrição disponível" description="Transcrições de áudios e chamadas serão exibidas aqui automaticamente." />;
}

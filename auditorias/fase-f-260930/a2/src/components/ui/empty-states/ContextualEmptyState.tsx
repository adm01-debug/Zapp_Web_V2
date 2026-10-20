import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '../button';
import { ArrowRight, ExternalLink, HelpCircle, Inbox } from 'lucide-react';
import { contextConfigs } from './contextConfigs';

interface ContextualEmptyStateProps {
  context: 'inbox' | 'contacts' | 'queues' | 'agents' | 'tags' | 'transcriptions' | 'dashboard' | 'search' | 'notifications' | 'calls' | 'wallet' | 'messages';
  title?: string;
  description?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
  searchQuery?: string;
  compact?: boolean;
  showHelp?: boolean;
  className?: string;
}

function EmptyIllustration({ context }: { context: string }) {
  const Icon = contextConfigs[context]?.icon || Inbox;
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: 'spring' }} className="relative mb-6">
      <div className="absolute inset-0 blur-3xl">
        <div className="w-full h-full bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 rounded-full" />
      </div>
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="relative w-24 h-24 mx-auto">
        <div className="w-full h-full rounded-3xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
          <Icon className="w-12 h-12 text-primary-foreground" />
        </div>
        <motion.div className="absolute inset-0 rounded-3xl border-2 border-primary/30" animate={{ scale: [1, 1.2], opacity: [0.3, 0] }} transition={{ duration: 2, repeat: Infinity }} />
        <motion.div className="absolute inset-0 rounded-3xl border-2 border-primary/20" animate={{ scale: [1, 1.4], opacity: [0.2, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
      </motion.div>
    </motion.div>
  );
}

export function ContextualEmptyState({
  context, title, description, onPrimaryAction, onSecondaryAction, onTertiaryAction, searchQuery, compact = false, showHelp = true, className,
}: ContextualEmptyStateProps) {
  const config = contextConfigs[context] || contextConfigs.messages;
  const displayTitle = context === 'search' && searchQuery ? `Nenhum resultado para "${searchQuery}"` : (title || config.title);
  const displayDescription = context === 'search' && !searchQuery ? 'Digite palavras-chave para encontrar conversas, contatos ou mensagens.' : (description || config.description);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className={cn('flex flex-col items-center justify-center text-center', compact ? 'p-6' : 'p-8 md:p-12', className)}>
      {!compact && <EmptyIllustration context={context} />}
      {compact && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--gradient-primary)' }}>
          {React.createElement(config.icon, { className: 'w-6 h-6 text-primary-foreground' })}
        </motion.div>
      )}
      <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={cn('font-display font-semibold text-foreground mb-2', compact ? 'text-lg' : 'text-xl md:text-2xl')}>
        {displayTitle}
      </motion.h3>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={cn('text-muted-foreground max-w-md mb-6', compact ? 'text-sm' : 'text-base')}>
        {displayDescription}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex flex-col sm:flex-row items-center gap-3 flex-wrap justify-center">
        {onPrimaryAction && (
          <Button onClick={onPrimaryAction} className="group shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all" style={{ background: 'var(--gradient-primary)' }}>
            {config.primaryAction.icon}{config.primaryAction.label}
            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
        )}
        {onSecondaryAction && config.secondaryAction && (
          <Button variant="outline" onClick={onSecondaryAction} className="group">
            {config.secondaryAction.icon}{config.secondaryAction.label}
          </Button>
        )}
        {onTertiaryAction && config.tertiaryAction && (
          <Button variant="ghost" onClick={onTertiaryAction} className="text-muted-foreground hover:text-foreground">
            {config.tertiaryAction.icon}{config.tertiaryAction.label}
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        )}
      </motion.div>
      {showHelp && config.helpText && !compact && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-xs text-muted-foreground/60 mt-6 flex items-center gap-1">
          <HelpCircle className="w-3 h-3" />{config.helpText}
        </motion.p>
      )}
    </motion.div>
  );
}

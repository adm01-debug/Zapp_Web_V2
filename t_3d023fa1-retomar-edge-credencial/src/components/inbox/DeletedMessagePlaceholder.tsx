import { Ban, Eye, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';

interface DeletedMessagePlaceholderProps {
  isSent: boolean;
  content?: string;
}

export function DeletedMessagePlaceholder({ isSent, content }: DeletedMessagePlaceholderProps) {
  const hasOriginalContent = content && content !== '[Mensagem apagada]';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'relative px-3.5 py-2.5 rounded-2xl shadow-sm border-2 border-dashed overflow-hidden',
        isSent
          ? 'rounded-br-md bg-primary/8 border-primary/25'
          : 'rounded-bl-md bg-amber-500/5 border-amber-500/20'
      )}
    >
      {/* Subtle pattern overlay */}
      <div className={cn(
        'absolute inset-0 opacity-[0.03]',
        'bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,currentColor_8px,currentColor_9px)]',
        isSent ? 'text-primary' : 'text-amber-500'
      )} />

      {/* Content */}
      <div className="relative z-10">
        {/* Deleted indicator badge */}
        <div className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-semibold mb-2',
          isSent
            ? 'bg-primary/10 text-primary/60'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        )}>
          {isSent ? (
            <Ban className="w-3 h-3" />
          ) : (
            <ShieldAlert className="w-3 h-3" />
          )}
          <span>{isSent ? 'Você apagou esta mensagem' : 'O contato apagou esta mensagem'}</span>
        </div>

        {/* Original content preserved */}
        {hasOriginalContent ? (
          <div>
            {!isSent && (
              <div className="flex items-center gap-1 mb-1.5 text-3xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Eye className="w-3 h-3" />
                <span>Conteúdo original preservado</span>
              </div>
            )}
            <p className={cn(
              'text-sm leading-relaxed whitespace-pre-wrap break-words',
              isSent
                ? 'line-through decoration-1 text-primary/40'
                : 'text-muted-foreground/70 italic'
            )}>
              {content}
            </p>
          </div>
        ) : (
          <p className={cn(
            'text-sm italic',
            isSent ? 'text-primary/30' : 'text-muted-foreground/40'
          )}>
            Conteúdo original não disponível
          </p>
        )}
      </div>
    </motion.div>
  );
}

import { Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, useReducedMotion } from 'framer-motion';
import { getInitials } from '@/lib/formatters';

interface CompactContactHeaderProps {
  contact: { name: string; avatar?: string };
  isVip: boolean;
  companyName?: string;
  firstName: string;
}

export function CompactContactHeader({ contact, isVip, companyName, firstName }: CompactContactHeaderProps) {
  // Com "reduzir movimento" nada se desloca: o cabeçalho nasce no estado final
  // (`initial={false}`), sem o quadro de entrada em y.
  const reduzido = useReducedMotion() ?? false;
  return (
    <motion.div data-testid="compact-contact-header" initial={reduzido ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-inbox-panel">
      <div className="relative">
        <Avatar className="w-9 h-9 ring-1 ring-border/20">
          <AvatarImage src={contact.avatar} alt={contact.name || 'Avatar'} />
          <AvatarFallback data-testid="compact-contact-initials" className="bg-primary/10 text-primary text-xs font-semibold">
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        {isVip && <Crown className="w-3 h-3 text-warning absolute -top-0.5 -right-0.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* O nome exibido é truncado por CSS; o `title` guarda o nome INTEIRO
              para quem passa o mouse ou lê em leitor de tela. */}
          <span className="text-sm font-semibold text-foreground truncate" title={contact.name}>{firstName}</span>
          {companyName && (
            <>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-xs text-muted-foreground truncate" title={companyName}>{companyName}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

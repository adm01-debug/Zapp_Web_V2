import { useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { cn } from '@/lib/utils';

export interface PinnedChatItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
}

interface PinnedConversationsStackProps {
  items: PinnedChatItem[];
  activeId?: string | null;
  onSelect: (contactId: string) => void;
  /** Quantos rostos exibir antes do contador "+N". */
  maxVisible?: number;
  className?: string;
}

const springConfig = { stiffness: 100, damping: 12 } as const;

function PinnedFace({
  item, isActive, onSelect,
}: { item: PinnedChatItem; isActive: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const x = useMotionValue(0);
  const rotate = useSpring(useTransform(x, [-50, 50], [-22, 22]), springConfig);
  const translateX = useSpring(useTransform(x, [-50, 50], [-12, 12]), springConfig);
  const colors = getAvatarColor(item.name || '?');

  return (
    <div
      className="relative -ml-3 first:ml-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - rect.left - rect.width / 2);
      }}
    >
      <AnimatePresence mode="popLayout">
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', ...springConfig } }}
            exit={{ opacity: 0, y: 8, scale: 0.6 }}
            style={{ translateX, rotate, whiteSpace: 'nowrap' }}
            className="absolute -top-14 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center rounded-lg border border-border bg-popover px-3 py-1.5 shadow-xl"
          >
            <div className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <span className="text-xs font-semibold text-popover-foreground">{item.name}</span>
            {item.subtitle && <span className="text-2xs text-muted-foreground">{item.subtitle}</span>}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={`Abrir conversa fixada com ${item.name}`}
        className="relative block rounded-full transition-transform duration-300 hover:z-40 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar className={cn('h-9 w-9 ring-2', isActive ? 'ring-primary' : 'ring-border')}>
          <AvatarImage src={item.avatarUrl || undefined} alt="" />
          <AvatarFallback className={cn('text-2xs font-semibold', colors.bg, colors.text)}>
            {getInitials(item.name || '?')}
          </AvatarFallback>
        </Avatar>
      </button>
    </div>
  );
}

/**
 * Rostos das conversas fixadas, exibidos no centro do cabeçalho do chat quando o
 * painel de detalhes do contato está fechado (espaço livre na mesma faixa do nome).
 */
export function PinnedConversationsStack({
  items, activeId, onSelect, maxVisible = 6, className,
}: PinnedConversationsStackProps) {
  if (items.length === 0) return null;
  const visible = items.slice(0, maxVisible);
  const overflow = items.length - visible.length;

  return (
    <div className={cn('flex items-center', className)} aria-label="Conversas fixadas">
      {visible.map((item) => (
        <PinnedFace key={item.id} item={item} isActive={item.id === activeId} onSelect={onSelect} />
      ))}
      {overflow > 0 && (
        <span
          className="-ml-3 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground ring-2 ring-border"
          aria-label={`Mais ${overflow} conversas fixadas`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

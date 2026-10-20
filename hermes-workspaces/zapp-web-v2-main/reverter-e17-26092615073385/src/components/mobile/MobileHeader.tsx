import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Search, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  onMenuOpen: () => void;
  onSearchOpen?: () => void;
  onNotificationsOpen?: () => void;
  currentView: string;
  agentName?: string;
  agentAvatar?: string;
  agentStatus?: 'online' | 'away' | 'offline';
  unreadCount?: number;
}

const viewLabels: Record<string, string> = {
  inbox: 'Conversas',
  dashboard: 'Dashboard',
  contacts: 'Contatos',
  agents: 'Equipe',
  groups: 'Grupos',
  queues: 'Filas',
  connections: 'Conexões',
  campaigns: 'Campanhas',
  chatbot: 'Chatbot',
  pipeline: 'Pipeline',
  wallet: 'Carteira',
  catalog: 'Catálogo',
  payments: 'Pagamentos',
  tags: 'Etiquetas',
  knowledge: 'Base de Conhecimento',
  automations: 'Automações',
  reports: 'Relatórios',
  settings: 'Configurações',
  security: 'Segurança',
  admin: 'Admin',
};

export const MobileHeader = forwardRef<HTMLElement, MobileHeaderProps>(
  function MobileHeader(
    {
      onMenuOpen,
      onSearchOpen,
      onNotificationsOpen,
      currentView,
      agentName,
      agentAvatar,
      agentStatus = 'online',
      unreadCount = 0,
    },
    ref
  ) {
    const initials = agentName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || 'U';

    return (
      <motion.header
        ref={ref}
        initial={{ y: -48 }}
        animate={{ y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 safe-area-top"
      >
        <div className="flex items-center justify-between px-3 h-12 bg-card/90 backdrop-blur-xl border-b border-border/40">
          {/* Left: Menu + Avatar */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-xl touch-manipulation active:scale-95"
              onClick={onMenuOpen}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </Button>

            <div className="relative">
              <Avatar className="w-7 h-7">
                <AvatarImage src={agentAvatar} alt={agentName} />
                <AvatarFallback className="bg-primary/15 text-primary text-[9px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-card',
                  agentStatus === 'online' && 'bg-[hsl(var(--online,142_71%_45%))]',
                  agentStatus === 'away' && 'bg-[hsl(var(--away,38_92%_50%))]',
                  agentStatus === 'offline' && 'bg-muted-foreground/50'
                )}
              />
            </div>
          </div>

          {/* Center: View title */}
          <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            <motion.h1
              key={currentView}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display font-semibold text-sm text-foreground truncate max-w-[180px]"
            >
              {viewLabels[currentView] || currentView.charAt(0).toUpperCase() + currentView.slice(1)}
            </motion.h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5">
            {onSearchOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-xl touch-manipulation active:scale-95"
                onClick={onSearchOpen}
                aria-label="Buscar"
              >
                <Search className="w-[18px] h-[18px] text-muted-foreground" />
              </Button>
            )}

            {onNotificationsOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-xl touch-manipulation active:scale-95 relative"
                onClick={onNotificationsOpen}
                aria-label="Notificações"
              >
                <Bell className="w-[18px] h-[18px] text-muted-foreground" />
                <AnimatePresence>
                  {unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            )}
          </div>
        </div>
      </motion.header>
    );
  }
);

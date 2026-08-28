import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MessageSquare, Home, Search, Bell, User } from 'lucide-react';
import { haptics } from './SwipeGestures';

// Re-export extracted components
export { SlideOverPanel, PinchZoom, LongPressMenu } from './MobileSlidePanel';

// Mobile Tab Bar
interface TabItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

interface MobileTabBarProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'default' | 'floating' | 'minimal';
}

export function MobileTabBar({ items, activeId, onChange, className, variant = 'default' }: MobileTabBarProps) {
  const handleChange = (id: string) => { haptics.selection(); onChange(id); };

  const baseStyles = 'fixed bottom-0 left-0 right-0 z-40 safe-area-bottom';
  const variantStyles = {
    default: 'bg-card border-t border-border',
    floating: 'mx-4 mb-4 rounded-2xl bg-card shadow-lg border border-border',
    minimal: 'bg-transparent',
  };

  return (
    <nav className={cn(baseStyles, variantStyles[variant], className)}>
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <motion.button key={item.id} whileTap={{ scale: 0.9 }} onClick={() => handleChange(item.id)}
              className={cn('flex flex-col items-center justify-center flex-1 h-full relative transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>
              {isActive && <motion.div layoutId="tabIndicator" className="absolute -top-0.5 w-8 h-1 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
              <div className="relative">
                <motion.div animate={{ scale: isActive ? 1.1 : 1 }} transition={{ type: 'spring', stiffness: 400 }}>{item.icon}</motion.div>
                {item.badge !== undefined && item.badge > 0 && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.span>
                )}
              </div>
              <span className={cn('text-[10px] mt-1 font-medium transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

// Default tab presets
export const defaultMobileTabItems: TabItem[] = [
  { id: 'home', icon: <Home className="w-5 h-5" />, label: 'Início' },
  { id: 'inbox', icon: <MessageSquare className="w-5 h-5" />, label: 'Inbox', badge: 3 },
  { id: 'search', icon: <Search className="w-5 h-5" />, label: 'Buscar' },
  { id: 'notifications', icon: <Bell className="w-5 h-5" />, label: 'Alertas', badge: 5 },
  { id: 'profile', icon: <User className="w-5 h-5" />, label: 'Perfil' },
];

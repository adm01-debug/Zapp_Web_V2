import React from 'react';
import { Archive, CheckCheck, Pin, Trash2, MoreHorizontal } from 'lucide-react';

// Haptic feedback utility
export const haptics = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(25),
  heavy: () => navigator.vibrate?.(50),
  success: () => navigator.vibrate?.([50, 30, 50]),
  error: () => navigator.vibrate?.([100, 50, 100]),
  selection: () => navigator.vibrate?.(5),
  notification: () => navigator.vibrate?.([100, 30, 100, 30, 100]),
};

export interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  action: () => void;
}

// Default swipe actions presets
export const defaultSwipeActions = {
  archive: {
    icon: React.createElement(Archive, { className: 'w-5 h-5' }),
    label: 'Arquivar',
    color: 'text-warning',
    bgColor: 'bg-warning/20',
    action: () => {},
  },
  markRead: {
    icon: React.createElement(CheckCheck, { className: 'w-5 h-5' }),
    label: 'Lido',
    color: 'text-success',
    bgColor: 'bg-success/20',
    action: () => {},
  },
  pin: {
    icon: React.createElement(Pin, { className: 'w-5 h-5' }),
    label: 'Fixar',
    color: 'text-primary',
    bgColor: 'bg-primary/20',
    action: () => {},
  },
  delete: {
    icon: React.createElement(Trash2, { className: 'w-5 h-5' }),
    label: 'Excluir',
    color: 'text-destructive',
    bgColor: 'bg-destructive/20',
    action: () => {},
  },
  more: {
    icon: React.createElement(MoreHorizontal, { className: 'w-5 h-5' }),
    label: 'Mais',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    action: () => {},
  },
};

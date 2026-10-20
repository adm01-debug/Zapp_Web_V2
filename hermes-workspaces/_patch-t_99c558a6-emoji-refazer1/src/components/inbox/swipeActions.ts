import { Archive, Check, Trash2, RotateCcw, Pin, PinOff, Star, Bell, BellOff } from 'lucide-react';

export interface SwipeAction {
  icon: typeof Archive;
  color: string;
  bgColor: string;
  label: string;
  action: () => void;
}

export const DEFAULT_LEFT_ACTION: SwipeAction = {
  icon: Check, color: 'text-primary-foreground', bgColor: 'bg-success', label: 'Lido', action: () => {},
};

export const DEFAULT_RIGHT_ACTION: SwipeAction = {
  icon: Archive, color: 'text-primary-foreground', bgColor: 'bg-warning', label: 'Arquivar', action: () => {},
};

/** Pre-configured swipe actions */
export const SWIPE_ACTIONS = {
  markAsRead: (onAction: () => void): SwipeAction => ({
    icon: Check, color: 'text-primary-foreground', bgColor: 'bg-success', label: 'Lido', action: onAction,
  }),
  markAsUnread: (onAction: () => void): SwipeAction => ({
    icon: RotateCcw, color: 'text-primary-foreground', bgColor: 'bg-info', label: 'Não lido', action: onAction,
  }),
  archive: (onAction: () => void): SwipeAction => ({
    icon: Archive, color: 'text-primary-foreground', bgColor: 'bg-warning', label: 'Arquivar', action: onAction,
  }),
  delete: (onAction: () => void): SwipeAction => ({
    icon: Trash2, color: 'text-primary-foreground', bgColor: 'bg-destructive', label: 'Excluir', action: onAction,
  }),
  pin: (onAction: () => void): SwipeAction => ({
    icon: Pin, color: 'text-primary-foreground', bgColor: 'bg-primary', label: 'Fixar', action: onAction,
  }),
  unpin: (onAction: () => void): SwipeAction => ({
    icon: PinOff, color: 'text-primary-foreground', bgColor: 'bg-muted-foreground', label: 'Desafixar', action: onAction,
  }),
  star: (onAction: () => void): SwipeAction => ({
    icon: Star, color: 'text-primary-foreground', bgColor: 'bg-warning', label: 'Favoritar', action: onAction,
  }),
  mute: (onAction: () => void): SwipeAction => ({
    icon: BellOff, color: 'text-primary-foreground', bgColor: 'bg-muted', label: 'Silenciar', action: onAction,
  }),
  unmute: (onAction: () => void): SwipeAction => ({
    icon: Bell, color: 'text-primary-foreground', bgColor: 'bg-info', label: 'Ativar som', action: onAction,
  }),
};

import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';

export function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
}

/**
 * WhatsApp-authentic message status icons:
 * - pending: Clock (animated pulse)
 * - sent: Single check ✓
 * - delivered: Double check ✓✓
 * - read: Double check ✓✓ in blue
 * - failed: Alert circle in red
 */
export const MessageStatusIcon = memo(function MessageStatusIcon({ status, className }: { status: Message['status']; className?: string }) {
  switch (status) {
    case 'sent':
      return (
        <Check
          className={cn(
            'w-[14px] h-[14px] transition-all duration-300 ease-out',
            className
          )}
          strokeWidth={2.5}
        />
      );
    case 'delivered':
      return (
        <CheckCheck
          className={cn(
            'w-[14px] h-[14px] transition-all duration-300 ease-out',
            className
          )}
          strokeWidth={2.5}
        />
      );
    case 'read':
      return (
        <CheckCheck
          className={cn(
            'w-[14px] h-[14px] text-[#53bdeb] transition-all duration-500 ease-out',
            className
          )}
          strokeWidth={2.5}
        />
      );
    case 'failed':
      return (
        <AlertCircle
          className={cn(
            'w-[14px] h-[14px] text-destructive',
            className
          )}
          strokeWidth={2.5}
        />
      );
    default:
      return (
        <Clock
          className={cn(
            'w-3 h-3 animate-pulse opacity-60',
            className
          )}
          strokeWidth={2}
        />
      );
  }
});

/**
 * CV-035/036 — Alerta de ocasião comercial detectada + prazo de entrega.
 */
import React from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { getOccasionEvent, daysUntil } from '@/data/copilot/commercial-calendar';
import { cn } from '@/lib/utils';

interface OccasionAlertProps {
  occasion: string | null;
  className?: string;
}

export function OccasionAlert({ occasion, className }: OccasionAlertProps) {
  if (!occasion) return null;
  const event = getOccasionEvent(occasion);
  if (!event) return null;

  const days = daysUntil(event.month, event.day);
  const note = event.urgencyNote(days);
  const isUrgent = days > 0 && days <= event.leadDaysWithPrint;

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        isUrgent
          ? 'border-orange-400/50 bg-orange-400/10 text-orange-700 dark:text-orange-300'
          : 'border-border bg-muted/40 text-foreground',
        className,
      )}
    >
      {isUrgent ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
      ) : (
        <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div>
        <span className="font-semibold">{event.label}</span>
        {' — '}
        {note}
      </div>
    </div>
  );
}

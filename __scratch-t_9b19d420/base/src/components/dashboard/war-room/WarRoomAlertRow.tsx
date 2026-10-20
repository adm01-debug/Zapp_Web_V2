import { motion } from 'framer-motion';
import { AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WarRoomAlert } from '@/hooks/business/useWarRoomData';

interface AlertRowProps {
  alert: WarRoomAlert;
  onDismiss: () => void;
}

const alertStyles = {
  critical: 'bg-destructive/10 border-destructive text-destructive',
  warning: 'bg-warning/10 border-warning text-warning',
  info: 'bg-muted border-muted-foreground/20 text-muted-foreground',
};

export function WarRoomAlertRow({ alert, onDismiss }: AlertRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn("p-3 rounded-lg border flex items-start gap-3", alertStyles[alert.type], alert.isNew && alert.type === 'critical' && "animate-pulse")}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{alert.title}</div>
        <div className="text-xs opacity-80">{alert.message}</div>
        <div className="text-xs opacity-60 mt-1">{alert.timestamp.toLocaleTimeString()}</div>
      </div>
      <Button variant="ghost" size="icon" className="shrink-0 h-6 w-6" onClick={onDismiss}><XCircle className="w-4 h-4" /></Button>
    </motion.div>
  );
}

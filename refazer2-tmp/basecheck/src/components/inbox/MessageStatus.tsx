import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MessageStatusProps {
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  className?: string;
  showLabel?: boolean;
}

const statusConfig = {
  pending: {
    icon: Clock,
    label: 'Enviando...',
    color: 'text-muted-foreground',
  },
  sent: {
    icon: Check,
    label: 'Enviado',
    color: 'text-muted-foreground',
  },
  delivered: {
    icon: CheckCheck,
    label: 'Entregue',
    color: 'text-muted-foreground',
  },
  read: {
    icon: CheckCheck,
    label: 'Lido',
    color: 'text-info',
  },
  failed: {
    icon: AlertCircle,
    label: 'Falha no envio',
    color: 'text-destructive',
  },
};

export const MessageStatus: React.FC<MessageStatusProps> = ({
  status,
  className,
  showLabel = false,
}) => {
  const config = statusConfig[status] || statusConfig.sent;
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1', className)}>
            <Icon className={cn('h-3.5 w-3.5', config.color)} />
            {showLabel && (
              <span className={cn('text-xs', config.color)}>{config.label}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

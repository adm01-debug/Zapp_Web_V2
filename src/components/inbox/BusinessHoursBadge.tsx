import { cn } from '@/lib/utils';
import { Clock, Sun } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBusinessHoursCheck } from '@/hooks/business/useBusinessHoursCheck';

interface BusinessHoursBadgeProps {
  connectionId: string | null | undefined;
  className?: string;
}

export function BusinessHoursBadge({ connectionId, className }: BusinessHoursBadgeProps) {
  const { data: isOpen } = useBusinessHoursCheck(connectionId);

  if (isOpen === null || isOpen === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
          isOpen
            ? 'bg-success/10 text-success border-success/30'
            : 'bg-muted/40 text-muted-foreground border-border/50',
          className,
        )}>
          {isOpen ? <Sun className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {isOpen ? 'Aberto' : 'Fechado'}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isOpen ? 'Dentro do horário comercial' : 'Fora do horário comercial'}
      </TooltipContent>
    </Tooltip>
  );
}

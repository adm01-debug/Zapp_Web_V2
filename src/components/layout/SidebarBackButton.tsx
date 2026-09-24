import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarBackButtonProps {
  canGoBack?: boolean;
  onGoBack?: () => void;
  collapsed: boolean;
}

/**
 * Voltar à tela anterior no desktop, sem texto de módulo. Só aparece quando há
 * histórico para voltar. Atalhos Alt+← e Esc continuam valendo.
 */
export function SidebarBackButton({ canGoBack, onGoBack, collapsed }: SidebarBackButtonProps) {
  if (!canGoBack || !onGoBack) return null;

  const button = (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          onClick={onGoBack}
          className={cn(
            'flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
            collapsed
              ? 'w-[38px] h-[38px] rounded-full border border-border/40 hover:border-border'
              : 'w-[28px] h-[28px] rounded-md mr-1'
          )}
          aria-label="Voltar à tela anterior"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        Voltar (Alt + ←)
      </TooltipContent>
    </Tooltip>
  );

  return collapsed ? <div className="flex justify-center mb-1">{button}</div> : button;
}

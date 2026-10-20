import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Radar, GraduationCap, FileText, Info, Loader2 } from 'lucide-react';
import { VisionIcon } from '../ai-tools/VisionIcon';

type ActiveTool = 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null;

interface ChatHeaderToolbarProps {
  activeTool?: ActiveTool;
  showAIAssistant: boolean;
  showDetails?: boolean;
  showSummaryPanel?: boolean;
  isSummaryLoading?: boolean;
  onOpenSearch: () => void;
  onSetActiveTool?: (tool: ActiveTool) => void;
  onToggleAIAssistant: () => void;
  onToggleDetails?: () => void;
  onGenerateSummary?: () => void;
}

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  badge?: boolean;
  highlight?: boolean;
}

function ToolButton({ icon, label, active, onClick, disabled, badge, highlight }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 border border-border/30",
            highlight ? "text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary ring-1 ring-primary/20" :
            active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            badge && "relative"
          )}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
          {badge && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChatHeaderToolbar({
  activeTool, showAIAssistant, showDetails, showSummaryPanel, isSummaryLoading,
  onOpenSearch, onSetActiveTool, onToggleAIAssistant, onToggleDetails, onGenerateSummary,
}: ChatHeaderToolbarProps) {
  return (
    <>
      <ToolButton icon={<Search className="w-[18px] h-[18px]" />} label="Buscar na conversa (Ctrl+F)" onClick={onOpenSearch} highlight />
      <ToolButton icon={<Radar className="w-[18px] h-[18px]" />} label="Monitoramento de Objeções" active={activeTool === 'objections'} onClick={() => onSetActiveTool?.('objections')} />
      <ToolButton icon={<GraduationCap className="w-[18px] h-[18px]" />} label="Ajuda dos Universitários" active={activeTool === 'university'} onClick={() => onSetActiveTool?.('university')} />
      <ToolButton icon={<VisionIcon className="w-[18px] h-[18px]" />} label="Visão" active={showAIAssistant} onClick={onToggleAIAssistant} />
      {onGenerateSummary && (
        <ToolButton
          icon={isSummaryLoading ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <FileText className="w-[18px] h-[18px]" />}
          label="Resumo da conversa" active={showSummaryPanel} onClick={onGenerateSummary} disabled={isSummaryLoading}
        />
      )}
      {onToggleDetails && (
        <ToolButton icon={<Info className="w-[18px] h-[18px]" />} label="Detalhes do contato" active={showDetails} onClick={onToggleDetails} badge={!showDetails} />
      )}
    </>
  );
}

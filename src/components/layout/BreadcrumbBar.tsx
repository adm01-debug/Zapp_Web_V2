import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavigationService } from '@/services/navigation.service';

interface BreadcrumbBarProps {
  breadcrumbTrail: string[];
  currentView: string;
  canGoBack: boolean;
  goBack: () => void;
  className?: string;
}

export function BreadcrumbBar({ breadcrumbTrail, currentView, canGoBack, goBack, className }: BreadcrumbBarProps) {
  if (!canGoBack && breadcrumbTrail.length === 0) return null;

  const trail = [...breadcrumbTrail, currentView];

  return (
    <div className={cn('h-9 flex items-center gap-2 px-4 border-b border-border/10 bg-sidebar/40 backdrop-blur-xl text-xs', className)}>
      {canGoBack && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors font-medium shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none rounded"
          aria-label="Teletransporte — voltar à tela anterior"
        >
          <Zap className="w-3.5 h-3.5" />
          Teletransporte
        </button>
      )}
      {canGoBack && trail.length > 0 && <div className="w-px h-3.5 bg-border/40 shrink-0" />}
      <nav className="flex items-center gap-1 min-w-0 overflow-hidden text-muted-foreground" aria-label="Trilha de navegação">
        {trail.map((viewId, index) => {
          const isLast = index === trail.length - 1;
          return (
            <span key={`${viewId}-${index}`} className="flex items-center gap-1 min-w-0">
              {index > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
              <span className={cn('truncate', isLast && 'text-foreground font-medium')}>
                {NavigationService.getViewLabel(viewId)}
              </span>
            </span>
          );
        })}
      </nav>
    </div>
  );
}

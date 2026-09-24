import { cn } from '@/lib/utils';
import { HeaderSectionAnchor } from './HeaderSectionAnchor';

interface AppHeaderProps {
  currentView: string;
  className?: string;
}

export function AppHeader({ currentView, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        'h-14 flex items-center gap-4 px-4 border-b border-border/10 bg-sidebar/60 backdrop-blur-xl',
        className
      )}
    >
      <HeaderSectionAnchor currentView={currentView} />
      <div className="flex-1" />
    </header>
  );
}
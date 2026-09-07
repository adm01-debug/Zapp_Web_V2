import { cn } from '@/lib/utils';
import { HeaderSectionAnchor } from './HeaderSectionAnchor';
import { GlobalSearchTrigger } from './GlobalSearchTrigger';
import { HeaderUserPill } from './HeaderUserPill';

interface AppHeaderProps {
  currentView: string;
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  onViewChange: (view: string) => void;
  className?: string;
}

export function AppHeader({ currentView, profile, userEmail, signOut, onViewChange, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        'h-14 flex items-center gap-4 px-4 border-b border-border/10 bg-sidebar/60 backdrop-blur-xl',
        className
      )}
    >
      <HeaderSectionAnchor currentView={currentView} />
      <div className="flex-1" />
      <GlobalSearchTrigger />
      <HeaderUserPill profile={profile} userEmail={userEmail} signOut={signOut} onViewChange={onViewChange} />
    </header>
  );
}

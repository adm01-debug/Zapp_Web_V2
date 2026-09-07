import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { ProfileMenuContent } from './AgentProfilePopover';
import { RoleBadge } from './RoleBadge';
import { useUserRole } from '@/hooks/system/useUserRole';

interface HeaderUserPillProps {
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  onViewChange: (view: string) => void;
}

export function HeaderUserPill({ profile, userEmail, signOut, onViewChange }: HeaderUserPillProps) {
  const [open, setOpen] = useState(false);
  const { roles } = useUserRole();
  const primaryRole = roles[0];
  const name = profile?.name || userEmail || 'Usuário';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
          aria-label="Perfil e status"
        >
          <span className="relative shrink-0">
            <Avatar className="w-8 h-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
              <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-semibold">
                {name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-sidebar bg-success" />
          </span>
          <span className="hidden md:flex flex-col items-start leading-tight min-w-0 gap-0.5">
            <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">{name}</span>
            {primaryRole && <RoleBadge role={primaryRole} className="h-4 px-1.5 text-[9px] leading-none" />}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" sideOffset={10} align="end" className="w-48 p-2">
        <ProfileMenuContent
          agent={{ name, status: 'online' }}
          onViewChange={(view) => { onViewChange(view); setOpen(false); }}
          onLogout={() => { signOut(); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

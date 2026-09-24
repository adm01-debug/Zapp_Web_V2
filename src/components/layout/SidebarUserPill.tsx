import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileMenuContent } from './ProfileMenuContent';
import { RoleBadge } from './RoleBadge';
import { useUserRole } from '@/hooks/system/useUserRole';

interface SidebarUserPillProps {
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  onViewChange: (view: string) => void;
  collapsed?: boolean;
}

/** Avatar, nome, cargo e menu de status/perfil — vive no rodapé da sidebar, dentro de "Controles rápidos". */
export function SidebarUserPill({ profile, userEmail, signOut, onViewChange, collapsed = false }: SidebarUserPillProps) {
  const [open, setOpen] = useState(false);
  const { roles } = useUserRole();
  const primaryRole = roles[0];
  const name = profile?.name || userEmail || 'Usuário';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center rounded-lg hover:bg-muted/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
            collapsed ? 'w-[36px] h-[36px] justify-center' : 'w-full gap-2 px-1.5 py-1'
          )}
          aria-label="Perfil e status"
        >
          <span className="relative shrink-0">
            <Avatar className="w-8 h-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
              <AvatarFallback className="bg-primary/15 text-primary text-2xs font-semibold">
                {name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-sidebar bg-success" />
          </span>
          {!collapsed && (
            <>
              <span className="flex flex-col items-start leading-tight min-w-0 flex-1 gap-0.5 text-left">
                <span className="text-xs font-semibold text-foreground truncate max-w-full">{name}</span>
                {primaryRole && <RoleBadge role={primaryRole} className="h-4 px-1.5 text-[9px] leading-none" />}
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={collapsed ? 'right' : 'top'}
        sideOffset={collapsed ? 12 : 10}
        align={collapsed ? 'end' : 'start'}
        className="w-48 p-2"
      >
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

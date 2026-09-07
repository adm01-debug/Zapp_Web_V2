import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Circle, Clock, MinusCircle, Settings, LogOut } from 'lucide-react';

interface AgentProfilePopoverProps {
  agent: { name: string; avatar?: string; status: 'online' | 'away' | 'offline' };
  collapsed: boolean;
  statusOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  onStatusChange?: (status: 'online' | 'away' | 'offline') => void;
  onViewChange: (view: string) => void;
  onLogout?: () => void;
}

const STATUS_OPTIONS = [
  { status: 'online' as const, label: 'Online', icon: Circle, color: 'text-[hsl(var(--online))]' },
  { status: 'away' as const, label: 'Ausente', icon: Clock, color: 'text-[hsl(var(--away))]' },
  { status: 'offline' as const, label: 'Offline', icon: MinusCircle, color: 'text-[hsl(var(--offline))]' },
] as const;

const STATUS_LABELS: Record<string, string> = { online: 'Online', away: 'Ausente', offline: 'Offline' };

export function AgentProfilePopover({ agent, collapsed, statusOpen, onStatusOpenChange, onStatusChange, onViewChange, onLogout }: AgentProfilePopoverProps) {
  return (
    <Popover open={statusOpen} onOpenChange={onStatusOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative group flex items-center gap-2.5 rounded-lg transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
            collapsed ? 'justify-center p-1' : 'w-full px-3 py-1.5'
          )}
          aria-label="Status e perfil"
        >
          <Avatar className="w-9 h-9 ring-2 ring-transparent group-hover:ring-primary/30 transition-all shrink-0">
            <AvatarImage src={agent.avatar} alt={agent.name} />
            <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-semibold">
              {agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span className={cn(
            'absolute w-2 h-2 rounded-full border-2 border-sidebar',
            collapsed ? '-bottom-0.5 -right-0.5' : 'bottom-1 left-[26px]',
            agent.status === 'online' && 'bg-success',
            agent.status === 'away' && 'bg-[hsl(var(--away))]',
            agent.status === 'offline' && 'bg-[hsl(var(--offline))]'
          )} />
          {!collapsed && (
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-[15px] font-semibold text-foreground truncate leading-tight">{agent.name}</span>
              <span className={cn(
                'text-[10px] capitalize leading-tight',
                agent.status === 'online' && 'text-[hsl(var(--online))]',
                agent.status === 'away' && 'text-[hsl(var(--away))]',
                agent.status === 'offline' && 'text-muted-foreground'
              )}>
                {STATUS_LABELS[agent.status]}
              </span>
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={12} align="end" className="w-48 p-2">
        <div className="px-2 py-1.5 mb-1">
          <p className="text-xs font-semibold text-foreground truncate">{agent.name}</p>
        </div>
        <div className="space-y-0.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              onClick={() => { onStatusChange?.(opt.status); onStatusOpenChange(false); }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
                agent.status === opt.status ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <opt.icon className={cn('w-3.5 h-3.5', opt.color)} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-1 pt-1 border-t border-border/50 space-y-0.5">
          <button onClick={() => { onViewChange('settings'); onStatusOpenChange(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
            <Settings className="w-3.5 h-3.5" />Configurações
          </button>
          {onLogout && (
            <button onClick={() => { onLogout(); onStatusOpenChange(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
              <LogOut className="w-3.5 h-3.5" />Sair da conta
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

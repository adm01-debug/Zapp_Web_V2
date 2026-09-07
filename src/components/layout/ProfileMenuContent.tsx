import { cn } from '@/lib/utils';
import { Circle, Clock, MinusCircle, Settings, LogOut } from 'lucide-react';

interface Agent { name: string; avatar?: string; status: 'online' | 'away' | 'offline' }

const STATUS_OPTIONS = [
  { status: 'online' as const, label: 'Online', icon: Circle, color: 'text-[hsl(var(--online))]' },
  { status: 'away' as const, label: 'Ausente', icon: Clock, color: 'text-[hsl(var(--away))]' },
  { status: 'offline' as const, label: 'Offline', icon: MinusCircle, color: 'text-[hsl(var(--offline))]' },
] as const;

interface ProfileMenuContentProps {
  agent: Agent;
  onStatusChange?: (status: 'online' | 'away' | 'offline') => void;
  onViewChange: (view: string) => void;
  onLogout?: () => void;
  onClose: () => void;
}

/** Conteúdo do menu de perfil — usado pelo HeaderUserPill. */
export function ProfileMenuContent({ agent, onStatusChange, onViewChange, onLogout, onClose }: ProfileMenuContentProps) {
  return (
    <>
      <div className="px-2 py-1.5 mb-1">
        <p className="text-xs font-semibold text-foreground truncate">{agent.name}</p>
      </div>
      <div className="space-y-0.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.status}
            onClick={() => { onStatusChange?.(opt.status); onClose(); }}
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
        <button onClick={() => { onViewChange('settings'); onClose(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
          <Settings className="w-3.5 h-3.5" />Configurações
        </button>
        {onLogout && (
          <button onClick={() => { onLogout(); onClose(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
            <LogOut className="w-3.5 h-3.5" />Sair da conta
          </button>
        )}
      </div>
    </>
  );
}

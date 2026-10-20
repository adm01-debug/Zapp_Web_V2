import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { cn } from '@/lib/utils';

/**
 * Quick toggle to mute/unmute all notification sounds.
 */
export function SoundMuteToggle({ className }: { className?: string }) {
  const { settings, updateSettings, isSaving } = useNotificationSettings();

  const isMuted = !settings.soundEnabled;

  const label = isMuted
    ? 'Ativar sons de alerta'
    : 'Silenciar sons de alerta';

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative rounded-lg transition-colors',
            !isMuted && 'text-primary',
            className,
          )}
          onClick={() => updateSettings({ soundEnabled: isMuted })}
          disabled={isSaving}
          aria-label={label}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isMuted ? (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          ) : (
            <>
              <Volume2 className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

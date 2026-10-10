import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { cn } from '@/lib/utils';

/**
 * Compact notification toggle button.
 * Toggles ALL notifications (sound + browser) on/off via the global settings.
 */
export function PushNotificationToggle({ className }: { className?: string }) {
  const { settings, updateSettings, isSaving } = useNotificationSettings();

  // "enabled" means both sound and browser notifications are on
  const isEnabled = settings.soundEnabled || settings.browserNotifications;

  const label = isEnabled
    ? 'Desativar todas as notificações'
    : 'Ativar todas as notificações';

  const handleToggle = () => {
    if (isEnabled) {
      // Disable all — only persist DB-mapped fields
      updateSettings({
        soundEnabled: false,
        browserNotifications: false,
        sentimentAlertEnabled: false,
        transcriptionNotificationEnabled: false,
      });
    } else {
      // Re-enable all — only persist DB-mapped fields
      updateSettings({
        soundEnabled: true,
        browserNotifications: true,
        sentimentAlertEnabled: true,
        transcriptionNotificationEnabled: true,
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 rounded-lg transition-colors',
            isEnabled && 'text-primary',
            className,
          )}
          onClick={handleToggle}
          disabled={isSaving}
          aria-label={label}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEnabled ? (
            <>
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </>
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

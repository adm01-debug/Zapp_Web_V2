import { Lock, LockOpen, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'screen-protection-enabled';

function getEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === 'true';
  } catch { return true; }
}

/**
 * Quick toggle for screen protection (anti-screenshot, blur overlay, etc.)
 */
export function ScreenProtectionToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(getEnabled);

  useEffect(() => {
    const handler = () => setEnabled(getEnabled());
    window.addEventListener('screen-protection-change', handler);
    return () => window.removeEventListener('screen-protection-change', handler);
  }, []);

  const toggle = () => {
    const next = !enabled;
    localStorage.setItem(STORAGE_KEY, String(next));
    setEnabled(next);
    window.dispatchEvent(new Event('screen-protection-change'));
  };

  const label = enabled
    ? 'Desativar proteção de tela'
    : 'Ativar proteção de tela';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 rounded-lg transition-colors',
            enabled && 'text-primary',
            className,
          )}
          onClick={toggle}
          aria-label={label}
        >
          {enabled ? (
            <>
              <Lock className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </>
          ) : (
            <LockOpen className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

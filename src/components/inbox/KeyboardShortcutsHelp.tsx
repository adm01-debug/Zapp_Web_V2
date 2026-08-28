import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';

export function KeyboardShortcutsHelp() {
  const { shortcuts, formatShortcut } = useCustomShortcuts();
  
  // Filter shortcuts relevant to inbox/selection
  const inboxShortcuts = shortcuts.filter(s => 
    s.category === 'selection' || 
    s.id === 'global-search' ||
    s.id === 'next-conversation' ||
    s.id === 'prev-conversation'
  );

  return (
    <TooltipProvider>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-foreground"
              >
                <Keyboard className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Atalhos de teclado</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-3 border-b border-border">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Keyboard className="w-4 h-4" />
              Atalhos de Teclado
            </h4>
          </div>
          <div className="p-2 space-y-1">
            {inboxShortcuts.map((shortcut) => {
              const keys = formatShortcut(shortcut);
              return (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50"
                >
                  <span className="text-sm text-muted-foreground">
                    {shortcut.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {keys.map((key, keyIndex) => (
                      <span key={keyIndex}>
                        <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border rounded shadow-sm">
                          {key}
                        </kbd>
                        {keyIndex < keys.length - 1 && (
                          <span className="mx-0.5 text-muted-foreground">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              Personalize em Configurações → Atalhos
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

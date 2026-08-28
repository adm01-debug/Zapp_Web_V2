import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Gauge, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x', description: 'Muito lento' },
  { value: 0.75, label: '0.75x', description: 'Lento' },
  { value: 1.0, label: '1x', description: 'Normal' },
  { value: 1.25, label: '1.25x', description: 'Rápido' },
  { value: 1.5, label: '1.5x', description: 'Mais rápido' },
  { value: 1.75, label: '1.75x', description: 'Muito rápido' },
  { value: 2.0, label: '2x', description: 'Máximo' },
];

interface SpeedSelectorProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
  className?: string;
}

export function SpeedSelector({ speed, onSpeedChange, className }: SpeedSelectorProps) {
  const currentOption = SPEED_OPTIONS.find(o => o.value === speed) || SPEED_OPTIONS[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 h-8", className)}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span className="text-xs">{currentOption.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Velocidade TTS (leitura de texto)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SPEED_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSpeedChange(option.value)}
            className="flex items-center justify-between cursor-pointer py-2"
          >
            <div className="flex flex-col">
              <span className="font-medium text-sm">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </div>
            {speed === option.value && (
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

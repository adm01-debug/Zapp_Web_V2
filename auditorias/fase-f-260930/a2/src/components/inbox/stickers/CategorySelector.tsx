import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';
import { CATEGORY_LABELS, ALL_CATEGORIES } from './StickerTypes';

interface CategorySelectorProps {
  value: string;
  onChange: (cat: string) => void;
  size?: 'sm' | 'xs';
}

export function CategorySelector({ value, onChange, size = 'sm' }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const info = CATEGORY_LABELS[value] || { emoji: '📦', label: value };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 rounded-md border border-border/50 transition-colors hover:bg-muted/60',
            size === 'xs' ? 'px-1.5 py-0.5 text-3xs' : 'px-2 py-1 text-xs'
          )}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Categoria: ${info.label}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span aria-hidden="true">{info.emoji}</span>
          <span className="text-muted-foreground">{info.label}</span>
          <ChevronDown className={cn(size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3', 'text-muted-foreground/60')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-1.5 max-h-[240px] overflow-y-auto"
        align="start"
        side="bottom"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        role="listbox"
        aria-label="Selecionar categoria"
      >
        <div className="space-y-0.5">
          {ALL_CATEGORIES.map(cat => {
            const catInfo = CATEGORY_LABELS[cat];
            const isActive = cat === value;
            return (
              <button
                key={cat}
                role="option"
                aria-selected={isActive}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(cat);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'
                )}
              >
                <span aria-hidden="true">{catInfo.emoji}</span>
                <span className="flex-1">{catInfo.label}</span>
                {isActive && <Check className="w-3 h-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

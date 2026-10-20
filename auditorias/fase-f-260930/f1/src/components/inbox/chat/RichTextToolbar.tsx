import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface RichTextToolbarProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  inputValue: string;
  onInputChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}

type FormatType = 'bold' | 'italic' | 'strikethrough' | 'code' | 'list' | 'ordered-list';

const FORMAT_MAP: Record<FormatType, { prefix: string; suffix: string; icon: React.ElementType; label: string; shortcut: string }> = {
  bold: { prefix: '*', suffix: '*', icon: Bold, label: 'Negrito', shortcut: 'Ctrl+B' },
  italic: { prefix: '_', suffix: '_', icon: Italic, label: 'Itálico', shortcut: 'Ctrl+I' },
  strikethrough: { prefix: '~', suffix: '~', icon: Strikethrough, label: 'Tachado', shortcut: 'Ctrl+Shift+X' },
  code: { prefix: '```', suffix: '```', icon: Code, label: 'Código', shortcut: 'Ctrl+E' },
  list: { prefix: '- ', suffix: '', icon: List, label: 'Lista', shortcut: '' },
  'ordered-list': { prefix: '1. ', suffix: '', icon: ListOrdered, label: 'Lista Numerada', shortcut: '' },
};

export function RichTextToolbar({ inputRef, inputValue, onInputChange, visible, onToggle }: RichTextToolbarProps) {
  const applyFormat = (type: FormatType) => {
    const input = inputRef.current;
    if (!input) return;

    const { prefix, suffix } = FORMAT_MAP[type];
    const start = input.selectionStart ?? inputValue.length;
    const end = input.selectionEnd ?? inputValue.length;
    const selectedText = inputValue.substring(start, end);

    let newValue: string;
    let newCursorPos: number;

    if (type === 'list' || type === 'ordered-list') {
      const lineStart = inputValue.lastIndexOf('\n', start - 1) + 1;
      newValue = inputValue.substring(0, lineStart) + prefix + inputValue.substring(lineStart);
      newCursorPos = start + prefix.length;
    } else if (selectedText) {
      newValue = inputValue.substring(0, start) + prefix + selectedText + suffix + inputValue.substring(end);
      newCursorPos = end + prefix.length + suffix.length;
    } else {
      newValue = inputValue.substring(0, start) + prefix + suffix + inputValue.substring(end);
      newCursorPos = start + prefix.length;
    }

    onInputChange(newValue);

    // Restore cursor position
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-0.5 px-4 py-1.5 border-t border-border/50 bg-muted/30" role="toolbar" aria-label="Formatação de texto">
            {(Object.entries(FORMAT_MAP) as [FormatType, typeof FORMAT_MAP[FormatType]][]).map(([type, { icon: Icon, label, shortcut }]) => (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => applyFormat(type)}
                    aria-label={label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {label}{shortcut ? ` (${shortcut})` : ''}
                </TooltipContent>
              </Tooltip>
            ))}
            <span className="ml-auto text-3xs text-muted-foreground/60">Formatação WhatsApp</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Toolbar toggle button for use in input area
export function RichTextToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "w-9 h-9 shrink-0",
            active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          onClick={onToggle}
          aria-label="Formatação de texto"
        >
          <Type className="w-[18px] h-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Formatação de texto</TooltipContent>
    </Tooltip>
  );
}

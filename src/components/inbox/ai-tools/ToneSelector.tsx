import { memo } from 'react';
import { cn } from '@/lib/utils';

export const TONE_OPTIONS = [
  { key: 'professional', label: 'Formal', emoji: '💼', prompt: 'Use tom formal, profissional e corporativo.' },
  { key: 'friendly', label: 'Amigável', emoji: '😊', prompt: 'Use tom amigável, acolhedor e empático.' },
  { key: 'objective', label: 'Objetivo', emoji: '🎯', prompt: 'Use tom amigável e direto ao ponto, sem rodeios mas mantendo empatia. Seja claro, objetivo e eficiente na comunicação.' },
  { key: 'casual', label: 'Descontraído', emoji: '🤙', prompt: 'Use tom descontraído, leve e informal.' },
  { key: 'persuasive', label: 'Persuasivo', emoji: '🔥', prompt: 'Use tom persuasivo, confiante e orientado a resultados.' },
] as const;

export type ToneKey = typeof TONE_OPTIONS[number]['key'];

export function getTonePrompt(tone: ToneKey): string {
  return TONE_OPTIONS.find(t => t.key === tone)!.prompt;
}

interface ToneSelectorProps {
  selected: ToneKey;
  onChange: (tone: ToneKey) => void;
  disabled?: boolean;
}

export const ToneSelector = memo(function ToneSelector({ selected, onChange, disabled }: ToneSelectorProps) {
  return (
    <div className="flex items-center justify-between gap-1" role="radiogroup" aria-label="Tom da resposta">
      {TONE_OPTIONS.map(t => {
        const isActive = selected === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(t.key)}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 px-3 rounded-2xl text-2xs font-semibold transition-all duration-200 flex-1 min-w-0',
              isActive
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <span className="text-lg leading-none">{t.emoji}</span>
            <span className="truncate w-full text-center">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
});

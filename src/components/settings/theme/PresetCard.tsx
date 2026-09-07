import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import type { ThemePreset } from './presets';

interface PresetCardProps {
  preset: ThemePreset;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function PresetCard({ preset, isActive, onSelect }: PresetCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <Card
        className={`cursor-pointer transition-all border-2 ${
          isActive
            ? 'border-primary shadow-lg shadow-primary/20'
            : 'border-secondary/20 hover:border-primary/40'
        }`}
        onClick={() => onSelect(preset.id)}
      >
        <CardContent className="p-3">
          {/* Color bar preview */}
          <div className="flex h-7 rounded-md overflow-hidden mb-2.5 ring-1 ring-border/30">
            {preset.swatches.map((swatch: string, i: number) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span>{preset.emoji}</span>
                <span className="truncate">{preset.name}</span>
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{preset.description}</p>
            </div>
            {isActive && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

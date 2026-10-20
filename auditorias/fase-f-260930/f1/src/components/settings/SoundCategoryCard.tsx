import { motion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SoundOption {
  id: string;
  name: string;
  description: string;
}

interface SoundCategoryCardProps {
  categoryKey: string;
  label: string;
  description: string;
  icon: React.ElementType;
  sounds: SoundOption[];
  currentSound: string;
  isPlaying: boolean;
  disabled: boolean;
  onSoundChange: (category: string, soundId: string) => void;
  onPlayPreview: (category: string, soundId: string) => void;
}

export function SoundCategoryCard({ categoryKey, label, description, icon: Icon, sounds, currentSound, isPlaying, disabled, onSoundChange, onPlayPreview }: SoundCategoryCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn('transition-all hover:border-primary/30', disabled && 'opacity-50 pointer-events-none')}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={cn('p-2.5 rounded-lg shrink-0', isPlaying ? 'bg-primary/20 animate-pulse' : 'bg-muted')}>
              <Icon className={cn('w-5 h-5', isPlaying ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">{label}</h4>
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={currentSound} onValueChange={(value) => onSoundChange(categoryKey, value)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sounds.map((sound) => (
                    <SelectItem key={sound.id} value={sound.id}>{sound.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" disabled={currentSound === 'none'} onClick={() => onPlayPreview(categoryKey, currentSound)} className="shrink-0">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

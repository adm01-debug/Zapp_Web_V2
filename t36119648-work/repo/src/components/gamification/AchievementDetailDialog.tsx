import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Gift, Trophy, Star, Medal, Target, Zap, Crown, Flame, Award } from 'lucide-react';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: 'trophy' | 'star' | 'medal' | 'target' | 'zap' | 'crown' | 'flame' | 'award';
  category: 'messages' | 'speed' | 'satisfaction' | 'streak' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  progress: number;
  target: number;
  xpReward: number;
  isUnlocked: boolean;
  unlockedAt?: Date;
  isNew?: boolean;
}

const iconMap = { trophy: Trophy, star: Star, medal: Medal, target: Target, zap: Zap, crown: Crown, flame: Flame, award: Award };
const rarityConfig = {
  common: { label: 'Comum', color: 'bg-muted' },
  rare: { label: 'Raro', color: 'bg-info' },
  epic: { label: 'Épico', color: 'bg-primary' },
  legendary: { label: 'Lendário', color: 'bg-warning' },
};

interface AchievementDetailDialogProps {
  achievement: Achievement | null;
  onClose: () => void;
  onClaim: (achievement: Achievement) => void;
}

export function AchievementDetailDialog({ achievement, onClose, onClaim }: AchievementDetailDialogProps) {
  if (!achievement) return null;

  const Icon = iconMap[achievement.icon];
  const rarity = rarityConfig[achievement.rarity];

  return (
    <Dialog open={!!achievement} onOpenChange={() => onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${rarity.color}/20`}>
              <Icon className={`h-6 w-6 ${rarity.color.replace('bg-', 'text-')}`} />
            </div>
            {achievement.name}
          </DialogTitle>
          <DialogDescription>{achievement.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Raridade</span>
            <Badge className={rarity.color}>{rarity.label}</Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Recompensa</span>
            <Badge variant="secondary"><Gift className="h-3 w-3 mr-1" />{achievement.xpReward} XP</Badge>
          </div>

          {!achievement.isUnlocked && (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progresso</span>
                <span>{achievement.progress}/{achievement.target}</span>
              </div>
              <Progress value={(achievement.progress / achievement.target) * 100} className="h-3" />
            </div>
          )}

          {achievement.isUnlocked && achievement.isNew && (
            <Button className="w-full" onClick={() => { onClaim(achievement); onClose(); }}>
              <Gift className="h-4 w-4 mr-2" />Reivindicar Recompensa
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

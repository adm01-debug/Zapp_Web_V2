import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Star, Trophy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { useCelebration } from '@/components/effects/Confetti';
import { GAMES, type GameType } from './miniGamesData';
import { SpeedTypingGame, QuizGame, EmojiDecodeGame } from './MiniGameDialogs';

interface TrainingMiniGamesProps {
  onXPEarned?: (xp: number) => void;
}

export function TrainingMiniGames({ onXPEarned }: TrainingMiniGamesProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<Record<GameType, number>>(() => {
    const saved = localStorage.getItem('miniGameHighScores');
    return saved ? JSON.parse(saved) : {};
  });
  const { celebrate } = useCelebration();

  const saveHighScore = (game: GameType, newScore: number) => {
    const currentHigh = highScores[game] || 0;
    if (newScore > currentHigh) {
      const updated = { ...highScores, [game]: newScore };
      setHighScores(updated);
      localStorage.setItem('miniGameHighScores', JSON.stringify(updated));
      return true;
    }
    return false;
  };

  const handleGameComplete = (finalScore: number, xpEarned: number) => {
    const game = GAMES.find(g => g.id === selectedGame);
    const isNewHighScore = saveHighScore(selectedGame!, finalScore);
    if (isNewHighScore) celebrate({ title: '🏆 Novo Recorde!', subtitle: `${finalScore} pontos!`, emoji: '🎮' });
    onXPEarned?.(xpEarned);
    toast({ title: `🎮 ${game?.name} Completo!`, description: `Você ganhou ${xpEarned} XP${isNewHighScore ? ' e bateu seu recorde!' : ''}` });
    setIsPlaying(false);
    setScore(finalScore);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gamepad2 className="h-5 w-5 text-primary" />Mini-games de Treinamento</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GAMES.map((game) => {
            const Icon = game.icon;
            const highScore = highScores[game.id] || 0;
            return (
              <motion.button key={game.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => { setSelectedGame(game.id); setIsPlaying(true); setScore(0); }}
                className="p-4 rounded-lg border hover:border-primary/50 text-left transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-6 w-6 text-primary" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{game.name}</h3>
                      <Badge variant="outline" className="text-xs">{game.difficulty === 'easy' ? '🟢' : game.difficulty === 'medium' ? '🟡' : '🔴'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{game.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-xs"><Star className="h-3 w-3 mr-1" />{game.xpReward} XP</Badge>
                      {highScore > 0 && <Badge variant="outline" className="text-xs"><Trophy className="h-3 w-3 mr-1" />{highScore}</Badge>}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
        <SpeedTypingGame isOpen={selectedGame === 'speed-typing' && isPlaying} onClose={() => setIsPlaying(false)} onComplete={handleGameComplete} />
        <QuizGame isOpen={selectedGame === 'quiz' && isPlaying} onClose={() => setIsPlaying(false)} onComplete={handleGameComplete} />
        <EmojiDecodeGame isOpen={selectedGame === 'emoji-decode' && isPlaying} onClose={() => setIsPlaying(false)} onComplete={handleGameComplete} />
      </CardContent>
    </Card>
  );
}

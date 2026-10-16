import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Trophy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { useCelebration } from '@/components/effects/Confetti';
import { GAMES, type GameType } from './miniGamesData';
import { SpeedTypingGame, QuizGame, EmojiDecodeGame } from './MiniGameDialogs';

interface TrainingMiniGamesProps {
  onXPEarned?: (xp: number) => void;
}

export function TrainingMiniGames(_props: TrainingMiniGamesProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<Record<GameType, number>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('miniGameHighScores') ?? '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {} as Record<GameType, number>;
      return Object.fromEntries(Object.entries(saved).filter(([id, value]) => GAMES.some(game => game.id === id) && typeof value === 'number' && Number.isFinite(value) && value >= 0)) as Record<GameType, number>;
    } catch {
      return {} as Record<GameType, number>;
    }
  });
  const { celebrate } = useCelebration();
  // PB-18/D4: pontuação local não autoriza crédito de XP no servidor.
  // A conclusão pode ser publicada novamente pelo efeito do diálogo.
  const creditoDaPartida = useRef(false);

  const saveHighScore = (game: GameType, newScore: number) => {
    const currentHigh = highScores[game] || 0;
    if (newScore > currentHigh) {
      const updated = { ...highScores, [game]: newScore };
      setHighScores(updated);
      try { localStorage.setItem('miniGameHighScores', JSON.stringify(updated)); } catch { /* recorde da sessão continua disponível */ }
      return true;
    }
    return false;
  };

  const handleGameComplete = (finalScore: number) => {
    const game = GAMES.find(g => g.id === selectedGame);
    if (!game || creditoDaPartida.current) return;
    creditoDaPartida.current = true;
    const validScore = Number.isFinite(finalScore) ? Math.max(0, Math.trunc(finalScore)) : 0;
    const isNewHighScore = saveHighScore(game.id, validScore);
    if (isNewHighScore) celebrate({ title: '🏆 Novo Recorde!', subtitle: `${finalScore} pontos!`, emoji: '🎮' });
    setIsPlaying(false);
    setScore(validScore);
    toast({ title: `🎮 ${game.name} Completo!`, description: `${validScore} pontos.${isNewHighScore ? ' Você bateu seu recorde!' : ''} Treinamento sem crédito de XP.` });
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
                onClick={() => { setSelectedGame(game.id); setIsPlaying(true); setScore(0); creditoDaPartida.current = false; }}
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
                      <Badge variant="secondary" className="text-xs">Recorde pessoal · sem XP</Badge>
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

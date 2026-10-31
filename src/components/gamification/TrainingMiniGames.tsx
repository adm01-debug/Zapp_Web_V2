import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Trophy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { useCelebration } from '@/components/effects/Confetti';
import { GAMES, type GameType } from './miniGamesData';
import { SpeedTypingGame, QuizGame, EmojiDecodeGame } from './MiniGameDialogs';

/**
 * PB-18/D4: o cliente não credita XP (as RPCs de XP saem do alcance de
 * `authenticated`; o XP de verdade vem dos gatilhos de servidor). Os mini-games
 * guardam só o RECORDE PESSOAL, por `game.id`, em `miniGameHighScores`.
 */
const CHAVE_RECORDES = 'miniGameHighScores';

interface TrainingMiniGamesProps {
  /** Mantida por compatibilidade com o dashboard; os mini-games não creditam XP. */
  onXPEarned?: (xp: number) => void;
}

type Recordes = Partial<Record<GameType, number>>;

/** `localStorage` é do usuário: JSON inválido, forma errada ou acesso bloqueado viram "sem recordes". */
function lerRecordes(): Recordes {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE_RECORDES) ?? '{}');
    if (!salvo || typeof salvo !== 'object' || Array.isArray(salvo)) return {};
    return Object.fromEntries(
      Object.entries(salvo).filter(
        ([id, valor]) =>
          GAMES.some((game) => game.id === id) &&
          typeof valor === 'number' &&
          Number.isFinite(valor) &&
          valor >= 0,
      ),
    ) as Recordes;
  } catch {
    return {};
  }
}

export function TrainingMiniGames(_props: TrainingMiniGamesProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highScores, setHighScores] = useState<Recordes>(lerRecordes);
  const { celebrate } = useCelebration();
  // O diálogo publica a conclusão mais de uma vez (o efeito reexecuta a cada
  // render), então o aviso e o recorde são tratados uma vez por partida.
  const partidaConcluida = useRef(false);

  const saveHighScore = (game: GameType, newScore: number) => {
    const currentHigh = highScores[game] || 0;
    if (newScore > currentHigh) {
      const updated = { ...highScores, [game]: newScore };
      setHighScores(updated);
      try {
        localStorage.setItem(CHAVE_RECORDES, JSON.stringify(updated));
      } catch {
        /* escrita bloqueada: o recorde da sessão continua na tela */
      }
      return true;
    }
    return false;
  };

  const handleGameComplete = (finalScore: number) => {
    const game = GAMES.find(g => g.id === selectedGame);
    if (!game || partidaConcluida.current) return;
    partidaConcluida.current = true;
    const pontos = Number.isFinite(finalScore) ? Math.max(0, Math.trunc(finalScore)) : 0;
    const isNewHighScore = saveHighScore(game.id, pontos);
    if (isNewHighScore) celebrate({ title: '🏆 Novo Recorde!', subtitle: `${pontos} pontos!`, emoji: '🎮' });
    setIsPlaying(false);
    toast({
      title: `🎮 ${game.name} Completo!`,
      description: `${pontos} pontos.${isNewHighScore ? ' Novo recorde!' : ''}`,
    });
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
                onClick={() => { setSelectedGame(game.id); setIsPlaying(true); partidaConcluida.current = false; }}
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
                      <Badge variant="secondary" className="text-xs">Recorde pessoal</Badge>
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

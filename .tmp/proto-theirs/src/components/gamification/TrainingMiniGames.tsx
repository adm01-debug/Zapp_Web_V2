import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Trophy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { useCelebration } from '@/components/effects/Confetti';
import { useAgentGamification } from '@/hooks/gamification/useAgentGamification';
import { log } from '@/lib/logger';
import { GAMES, type GameType } from './miniGamesData';
import { SpeedTypingGame, QuizGame, EmojiDecodeGame } from './MiniGameDialogs';

const HIGH_SCORES_KEY = 'miniGameHighScores';

/**
 * Lê os recordes pessoais do `localStorage` protegido.
 *
 * O conteúdo é do usuário: pode ser `null`, JSON inválido ou um valor que não
 * é registro de números (array, texto, `null`). Qualquer um desses tem de
 * virar "ainda não jogou" em vez de derrubar a tela do dashboard. Além da
 * leitura, o parse e a forma são validados; chave desconhecida ou valor que
 * não seja número finito e não negativo é descartado.
 */
function readHighScores(): Partial<Record<GameType, number>> {
  try {
    const saved = localStorage.getItem(HIGH_SCORES_KEY);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const stored = parsed as Record<string, unknown>;
    const clean: Partial<Record<GameType, number>> = {};
    for (const game of GAMES) {
      const value = stored[game.id];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        clean[game.id] = value;
      }
    }
    return clean;
  } catch {
    // `localStorage` bloqueado (modo privado, cota, política) ou JSON corrompido:
    // sem recorde persistido, mas o widget continua jogável na sessão.
    return {};
  }
}

/** Persiste os recordes; falha de escrita nunca derruba a partida já jogada. */
function writeHighScores(scores: Partial<Record<GameType, number>>) {
  try {
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores));
  } catch {
    // Sem persistência, o recorde vale só na sessão.
  }
}

export function TrainingMiniGames() {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<Partial<Record<GameType, number>>>(readHighScores);
  const { celebrate } = useCelebration();
  const { creditMiniGameXp } = useAgentGamification();
  // R2-AUTH-043: a conclusão credita de verdade o XP que a partida rendeu.
  // O diálogo publica a conclusão mais de uma vez (o efeito reexecuta a cada
  // render), então o crédito é por partida.
  const creditoDaPartida = useRef(false);

  const saveHighScore = (game: GameType, newScore: number) => {
    const currentHigh = highScores[game] || 0;
    if (newScore > currentHigh) {
      const updated = { ...highScores, [game]: newScore };
      setHighScores(updated);
      writeHighScores(updated);
      return true;
    }
    return false;
  };

  const handleGameComplete = async (finalScore: number, xpEarned: number) => {
    const game = GAMES.find(g => g.id === selectedGame);
    const isNewHighScore = saveHighScore(selectedGame!, finalScore);
    if (isNewHighScore) celebrate({ title: '🏆 Novo Recorde!', subtitle: `${finalScore} pontos!`, emoji: '🎮' });
    setIsPlaying(false);
    setScore(finalScore);
    // Sem cartão correspondente (id sem diálogo) ou conclusão já creditada: nada a fazer.
    if (!game || creditoDaPartida.current) return;
    creditoDaPartida.current = true;

    const xp = Math.max(0, Math.trunc(xpEarned || 0));
    if (xp === 0) {
      toast({
        title: `🎮 ${game.name} Completo!`,
        description: `Nenhum XP nesta partida (0 acertos não rende XP).${isNewHighScore ? ' Você bateu seu recorde!' : ''}`,
      });
      return;
    }
    try {
      const resultado = await creditMiniGameXp({ gameId: game.id, xp });
      if (!resultado.credited) {
        toast({
          title: 'Limite diário de mini-games atingido',
          description: `Você já creditou ${resultado.maxPartidasDia} partidas de ${game.name} hoje. O XP volta amanhã.`,
        });
        return;
      }
      onXPEarned?.(resultado.xpCreditado);
      toast({
        title: `🎮 ${game.name} Completo!`,
        description: `Você ganhou ${resultado.xpCreditado} XP${isNewHighScore ? ' e bateu seu recorde!' : ''}` +
          `${resultado.leveledUp ? ` — Nível ${resultado.newLevel}!` : ''}`,
      });
    } catch (error) {
      log.error('Falha ao creditar o XP do mini-game:', error);
      toast({
        variant: 'destructive',
        title: 'XP não creditado',
        description: `Os ${xp} XP de "${game.name}" não foram salvos na sua conta. Tente novamente.`,
      });
    }
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

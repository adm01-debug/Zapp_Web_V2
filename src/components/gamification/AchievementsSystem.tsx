import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Crown, Trophy } from 'lucide-react';
import { useAgentGamification, levelProgress, xpForNextLevel } from '@/hooks/gamification/useAgentGamification';
import { AchievementsPanel } from './AchievementsPanel';

/**
 * View Conquistas (rota `achievements` do ViewRouter).
 *
 * R2-AUTH-042 (#266): até aqui a tela carregava uma lista fixa (MOCK_ACHIEVEMENTS)
 * com oito conquistas, três desbloqueadas, 400 XP e "756/1000" conversas resolvidas
 * — os mesmos números para qualquer conta, inclusive conta nova. Passa a exibir o
 * estado autorizado do usuário autenticado (agent_stats/agent_achievements via
 * useAgentGamification) e a distinguir carregando, ausência real e erro.
 */
interface AchievementsSystemProps {
  /**
   * O ViewRouter monta a view com o id do usuário. A leitura, porém, sempre vem do
   * usuário autenticado (useAgentGamification) — a prop fica só para compatibilidade.
   */
  userId?: string;
  showCompact?: boolean;
}

export const AchievementsSystem = ({ showCompact = false }: AchievementsSystemProps) => {
  const { achievements, stats, isLoading, isError } = useAgentGamification();

  if (isLoading) {
    return <Card><CardContent className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Carregando conquistas...</div></CardContent></Card>;
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="font-medium">Não foi possível carregar suas conquistas</p>
          <p className="text-sm text-muted-foreground">A leitura da sua conta falhou. Recarregue a página para tentar de novo — nada aqui é exibido sem vir do servidor.</p>
        </CardContent>
      </Card>
    );
  }

  if (showCompact) {
    const totalXp = stats?.xp ?? 0;
    const level = stats?.level ?? 1;
    const recentAchievements = achievements.slice(0, 3);
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-warning" /><h1 className="text-lg font-semibold leading-none tracking-tight">Conquistas</h1></div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1"><Crown className="h-3 w-3" />Nível {level}</Badge>
              <Badge variant="secondary">{achievements.length} conquistas</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">{totalXp} XP</span>
            <span className="text-muted-foreground">{Math.max(0, xpForNextLevel(level) - totalXp)} XP para nível {level + 1}</span>
          </div>
          <Progress value={levelProgress(totalXp, level)} className="h-2" />
          {recentAchievements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recentAchievements.map(a => <Badge key={a.id} variant="secondary" className="text-3xs">{a.achievement_name}</Badge>)}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <AchievementsPanel />;
};

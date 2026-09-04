import { useMemo, useState } from 'react';
import { motion } from '@/components/ui/motion';
import { useNPSSurveys } from '@/hooks/business/useNPSSurveys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Users, ThumbsUp, ThumbsDown, Meh, BarChart3 } from 'lucide-react';

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 50 ? 'text-success' : score >= 0 ? 'text-warning' : 'text-destructive';
  const bg = score >= 50 ? 'bg-success/10' : score >= 0 ? 'bg-warning/10' : 'bg-destructive/10';
  const label = score >= 70 ? 'Excelente' : score >= 50 ? 'Bom' : score >= 0 ? 'Neutro' : 'Crítico';

  return (
    <div className={`flex flex-col items-center justify-center p-6 rounded-xl ${bg}`}>
      <span className={`text-5xl font-bold ${color}`}>{score}</span>
      <span className="text-sm text-muted-foreground mt-1">NPS Score</span>
      <Badge variant="outline" className="mt-2">{label}</Badge>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function NPSDashboard() {
  const { surveys, isLoading, metrics } = useNPSSurveys();

  const recentSurveys = useMemo(() => surveys.slice(0, 10), [surveys]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 w-full min-w-0"
    >
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Net Promoter Score (NPS)</h2>
        <p className="text-sm text-muted-foreground">Meça a lealdade dos seus clientes</p>
      </div>

      {/* Main Score + Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-4">
            <ScoreGauge score={metrics.npsScore} />
          </CardContent>
        </Card>

        <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Total de Respostas" value={metrics.totalResponses} color="bg-primary/10 text-primary" />
          <MetricCard icon={ThumbsUp} label="Promotores (9-10)" value={metrics.promoters} color="bg-success/10 text-success" />
          <MetricCard icon={Meh} label="Passivos (7-8)" value={metrics.passives} color="bg-warning/10 text-warning" />
          <MetricCard icon={ThumbsDown} label="Detratores (0-6)" value={metrics.detractors} color="bg-destructive/10 text-destructive" />
        </div>
      </div>

      {/* Distribution Bar */}
      {metrics.totalResponses > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Distribuição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-6 rounded-full overflow-hidden">
              {metrics.promoters > 0 && (
                <div
                  className="bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-medium"
                  style={{ width: `${(metrics.promoters / metrics.totalResponses) * 100}%` }}
                >
                  {Math.round((metrics.promoters / metrics.totalResponses) * 100)}%
                </div>
              )}
              {metrics.passives > 0 && (
                <div
                  className="bg-secondary flex items-center justify-center text-[10px] text-secondary-foreground font-medium"
                  style={{ width: `${(metrics.passives / metrics.totalResponses) * 100}%` }}
                >
                  {Math.round((metrics.passives / metrics.totalResponses) * 100)}%
                </div>
              )}
              {metrics.detractors > 0 && (
                <div
                  className="bg-destructive flex items-center justify-center text-[10px] text-destructive-foreground font-medium"
                  style={{ width: `${(metrics.detractors / metrics.totalResponses) * 100}%` }}
                >
                  {Math.round((metrics.detractors / metrics.totalResponses) * 100)}%
                </div>
              )}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>🟢 Promotores</span>
              <span>🟡 Passivos</span>
              <span>🔴 Detratores</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Surveys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Pesquisas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSurveys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma pesquisa NPS registrada ainda
            </p>
          ) : (
            <div className="space-y-2">
              {recentSurveys.map(survey => {
                const scoreColor = survey.score >= 9 ? 'text-success' : survey.score >= 7 ? 'text-warning' : 'text-destructive';
                const ScoreIcon = survey.score >= 9 ? TrendingUp : survey.score >= 7 ? Minus : TrendingDown;

                return (
                  <div key={survey.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1 font-bold text-lg ${scoreColor}`}>
                        <ScoreIcon className="w-4 h-4" />
                        {survey.score}
                      </div>
                      <div>
                        {survey.feedback && (
                          <p className="text-sm text-foreground line-clamp-1">{survey.feedback}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(survey.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {survey.survey_type === 'periodic' ? 'Periódica' : survey.survey_type === 'post_resolution' ? 'Pós-resolução' : 'Manual'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { 
  Activity, 
  MessageSquare, 
  Users, 
  Mail, 
  UserPlus,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeDashboard } from '@/hooks/analytics/useRealtimeDashboard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function RealtimeMetricsPanel() {
  const {
    messagesThisHour,
    messagesLastHour,
    messagesPerMinute,
    activeConversationsNow,
    newContactsToday,
    unreadMessages,
    metricsHistory,
    lastMessageAt,
    isConnected,
  } = useRealtimeDashboard();

  const hourChange = messagesLastHour > 0
    ? Math.round(((messagesThisHour - messagesLastHour) / messagesLastHour) * 100)
    : messagesThisHour > 0 ? 100 : 0;

  const metrics = [
    {
      label: 'Msgs/Hora',
      value: messagesThisHour,
      icon: MessageSquare,
      change: hourChange,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Msgs/Min',
      value: messagesPerMinute,
      icon: Activity,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Conversas Ativas',
      value: activeConversationsNow,
      icon: Users,
      color: 'text-info',
      bg: 'bg-info/10',
    },
    {
      label: 'Não Lidas',
      value: unreadMessages,
      icon: Mail,
      color: unreadMessages > 10 ? 'text-destructive' : 'text-warning',
      bg: unreadMessages > 10 ? 'bg-destructive/10' : 'bg-warning/10',
    },
    {
      label: 'Novos Contatos',
      value: newContactsToday,
      icon: UserPlus,
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
  ];

  // Simple sparkline from last 10 data points
  const sparkData = metricsHistory.slice(-10).map(m => m.messagesPerMinute);
  const maxSpark = Math.max(...sparkData, 1);

  return (
    <Card className="border-primary/20 overflow-hidden bg-card">
      <CardHeader className="border-b border-primary/20 bg-primary/5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Activity className="w-4 h-4 text-primary" />
            </motion.div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Métricas em Tempo Real
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {lastMessageAt && (
              <span className="text-xs text-muted-foreground">
                Última msg: {formatDistanceToNow(lastMessageAt, { addSuffix: true, locale: ptBR })}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                'text-xs gap-1.5 font-semibold',
                isConnected ? 'border-success/50 text-success' : 'border-destructive/50 text-destructive'
              )}
            >
              {isConnected ? (
                <motion.div
                  className="relative flex items-center justify-center"
                >
                  <motion.span
                    className="absolute w-3 h-3 rounded-full bg-success/40"
                    animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <Wifi className="w-3 h-3 relative z-10" />
                </motion.div>
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {isConnected ? 'Ao Vivo' : 'Offline'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.04, y: -2 }}
              className="flex flex-col items-center p-3 rounded-xl bg-muted/30 border border-border/30 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-default"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', metric.bg)}>
                <metric.icon className={cn('w-4 h-4', metric.color)} />
              </div>
              <motion.span
                key={metric.value}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-xl font-bold text-foreground"
              >
                {metric.value}
              </motion.span>
              <span className="text-xs text-muted-foreground text-center">{metric.label}</span>
              {'change' in metric && metric.change !== undefined && (
                <div className={cn(
                  'flex items-center gap-0.5 text-xs mt-1',
                  metric.change >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {metric.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(metric.change)}%
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Mini sparkline */}
        {sparkData.length > 1 && (
          <div className="mt-3 flex items-end gap-1 h-8 px-2">
            <span className="text-xs text-muted-foreground mr-2 self-center">Fluxo:</span>
            {sparkData.map((val, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((val / maxSpark) * 100, 8)}%` }}
                className="flex-1 rounded-sm bg-primary/60 min-h-[2px]"
                transition={{ delay: i * 0.03 }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

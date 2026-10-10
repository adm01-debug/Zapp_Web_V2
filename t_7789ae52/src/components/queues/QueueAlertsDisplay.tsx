import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Users, Clock, TrendingDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueueAlert } from '@/hooks/business/useQueueGoals';

interface QueueAlertsDisplayProps {
  alerts: QueueAlert[];
  onDismiss?: (alert: QueueAlert) => void;
  onNavigate?: (queueId: string) => void;
}

const alertIcons = {
  waiting_contacts: Users,
  wait_time: Clock,
  assignment_rate: TrendingDown,
  messages_pending: MessageSquare,
};

export function QueueAlertsDisplay({ alerts, onDismiss, onNavigate }: QueueAlertsDisplayProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, index) => {
          const Icon = alertIcons[alert.type];
          
          return (
            <motion.div
              key={`${alert.queueId}-${alert.type}`}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className={`
                relative flex items-center gap-3 p-3 rounded-lg border backdrop-blur
                ${alert.severity === 'critical' 
                  ? 'bg-destructive/10 border-destructive/30 text-destructive' 
                  : 'bg-warning/10 border-warning/30 text-warning'
                }
              `}
            >
              <div 
                className="w-1 h-8 rounded-full" 
                style={{ backgroundColor: alert.queueColor }}
              />
              
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center
                ${alert.severity === 'critical' ? 'bg-destructive/20' : 'bg-warning/20'}
              `}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span 
                    className="font-medium text-sm cursor-pointer hover:underline"
                    onClick={() => onNavigate?.(alert.queueId)}
                  >
                    {alert.queueName}
                  </span>
                  <span className={`
                    text-xs px-1.5 py-0.5 rounded
                    ${alert.severity === 'critical' ? 'bg-destructive/20' : 'bg-warning/20'}
                  `}>
                    {alert.severity === 'critical' ? 'Crítico' : 'Atenção'}
                  </span>
                </div>
                <p className="text-xs opacity-80 truncate">{alert.message}</p>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold">{alert.currentValue}</p>
                <p className="text-xs opacity-60">limite: {alert.threshold}</p>
              </div>

              {onDismiss && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-60 hover:opacity-100"
                  onClick={() => onDismiss(alert)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { Zap, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNextBestAction } from '@/hooks/chat/useNextBestAction';

interface NextBestActionProps {
  contactId: string;
  contactName: string;
}

export function NextBestActionEngine({ contactId, contactName }: NextBestActionProps) {
  const { actions, loading } = useNextBestAction(contactId, contactName);

  const priorityColors = {
    high: 'border-destructive/30 bg-destructive/5',
    medium: 'border-warning/30 bg-warning/5',
    low: 'border-primary/30 bg-primary/5',
  };

  const priorityBadge = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-primary/10 text-primary',
  };

  if (loading) {
    return <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted/20 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Próxima Melhor Ação</span>
      </div>
      {actions.map((action, idx) => {
        const Icon = action.icon;
        return (
          <motion.div
            key={action.type}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`p-3 rounded-xl border ${priorityColors[action.priority]} cursor-pointer hover:shadow-sm transition-shadow`}
          >
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.label}</span>
                  <Badge variant="outline" className={`text-[9px] ${priorityBadge[action.priority]}`}>
                    {action.priority === 'high' ? 'Urgente' : action.priority === 'medium' ? 'Normal' : 'Baixa'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

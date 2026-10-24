import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type AnalysisData, statusConfig, sentimentConfig, departmentConfig } from './analysisConfigs';

interface HistoryItem {
  id: string;
  summary: string;
  status: string;
  key_points: string[];
  next_steps: string[];
  sentiment: string;
  sentiment_score: number;
  topics: string[];
  urgency: string | null;
  customer_satisfaction: number | null;
  message_count: number | null;
  created_at: string;
  department?: string;
  relationship_type?: string;
}

interface HistoryTabProps {
  analyses: HistoryItem[];
  historyLoading: boolean;
  onLoadHistory: (item: AnalysisData) => void;
}

export function HistoryTab({ analyses, historyLoading, onLoadHistory }: HistoryTabProps) {
  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="py-8 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhuma análise anterior</p>
        <p className="mt-1 text-xs text-muted-foreground">Clique em &quot;Analisar&quot; para criar a primeira</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {analyses.map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="cursor-pointer rounded-xl border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/50"
          onClick={() =>
            onLoadHistory({
              department: item.department,
              relationshipType: item.relationship_type,
              summary: item.summary,
              status: item.status,
              keyPoints: item.key_points,
              nextSteps: item.next_steps,
              sentiment: item.sentiment,
              sentimentScore: item.sentiment_score,
              topics: item.topics,
              urgency: item.urgency ?? undefined,
              customerSatisfaction: item.customer_satisfaction ?? undefined,
            })
          }
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-3xs text-muted-foreground">
                {format(new Date(item.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
              </span>
              {item.department && departmentConfig[item.department] && (
                <Badge variant="outline" className={`${departmentConfig[item.department].color} text-[9px] px-1.5 py-0`}>
                  <span className="mr-0.5">{departmentConfig[item.department].emoji}</span>
                  {departmentConfig[item.department].label}
                </Badge>
              )}
            </div>
            <Badge variant="outline" className={`text-3xs ${sentimentConfig[item.sentiment]?.color || ''}`}>
              {item.sentiment_score}%
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed">{item.summary}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge variant="secondary" className="text-3xs">{item.message_count} msgs</Badge>
            {statusConfig[item.status] && (
              <Badge variant="outline" className={`text-3xs ${statusConfig[item.status].className}`}>
                {statusConfig[item.status].label}
              </Badge>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

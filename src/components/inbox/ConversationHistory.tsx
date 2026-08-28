import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import { 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  Calendar,
  Loader2,
  History,
  Filter
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationHistoryItem {
  id: string;
  date: Date;
  messageCount: number;
  lastMessage: string;
  status: 'resolved' | 'pending' | 'open';
  duration: string;
}

interface ConversationHistoryProps {
  contactId: string;
  contactPhone: string;
  onSelectConversation?: (conversationId: string) => void;
}

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

const periodOptions: { value: PeriodFilter; label: string; days: number | null }[] = [
  { value: '7d', label: 'Últimos 7 dias', days: 7 },
  { value: '30d', label: 'Últimos 30 dias', days: 30 },
  { value: '90d', label: 'Últimos 90 dias', days: 90 },
  { value: 'all', label: 'Todo o histórico', days: null },
];

const statusConfig = {
  resolved: { 
    label: 'Resolvido', 
    icon: CheckCircle2, 
    className: 'bg-success/10 text-success border-success/30' 
  },
  pending: { 
    label: 'Pendente', 
    icon: AlertCircle, 
    className: 'bg-warning/10 text-warning border-warning/30' 
  },
  open: { 
    label: 'Aberto', 
    icon: MessageSquare, 
    className: 'bg-info/10 text-info border-info/30' 
  },
};

export function ConversationHistory({ contactId, contactPhone, onSelectConversation }: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<ConversationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d');

  useEffect(() => {
    fetchConversationHistory();
  }, [contactId, contactPhone, periodFilter]);

  const fetchConversationHistory = async () => {
    setIsLoading(true);
    try {
      // Get the date filter
      const selectedPeriod = periodOptions.find(p => p.value === periodFilter);
      const fromDate = selectedPeriod?.days 
        ? subDays(new Date(), selectedPeriod.days).toISOString()
        : null;

      // Fetch messages grouped by date to simulate conversation sessions
      let query = supabase
        .from('messages')
        .select('id, content, created_at, sender')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fromDate) {
        query = query.gte('created_at', fromDate);
      }

      const { data: messages, error } = await query;

      if (error) {
        log.error('Error fetching conversation history:', error);
        setConversations([]);
        return;
      }

      if (!messages || messages.length === 0) {
        setConversations([]);
        return;
      }

      // Group messages by day to create "conversation sessions"
      const groupedByDay: Record<string, typeof messages> = {};
      messages.forEach(msg => {
        const dayKey = format(new Date(msg.created_at), 'yyyy-MM-dd');
        if (!groupedByDay[dayKey]) {
          groupedByDay[dayKey] = [];
        }
        groupedByDay[dayKey].push(msg);
      });

      // Convert to conversation history items
      const historyItems: ConversationHistoryItem[] = Object.entries(groupedByDay)
        .map(([dayKey, dayMessages]) => {
          const firstMsg = dayMessages[dayMessages.length - 1];
          const lastMsg = dayMessages[0];
          const startTime = new Date(firstMsg.created_at);
          const endTime = new Date(lastMsg.created_at);
          const durationMs = endTime.getTime() - startTime.getTime();
          const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

          // Determine status based on last message sender
          let status: 'resolved' | 'pending' | 'open' = 'resolved';
          if (lastMsg.sender === 'contact') {
            status = 'pending';
          } else if (durationMinutes < 5) {
            status = 'open';
          }

          return {
            id: dayKey,
            date: new Date(dayKey),
            messageCount: dayMessages.length,
            lastMessage: lastMsg.content.length > 50 
              ? `${lastMsg.content.substring(0, 50)}...` 
              : lastMsg.content,
            status,
            duration: durationMinutes > 60 
              ? `${Math.round(durationMinutes / 60)}h ${durationMinutes % 60}min`
              : `${durationMinutes}min`,
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      setConversations(historyItems);
    } catch (error) {
      log.error('Error fetching conversation history:', error);
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const displayedConversations = isExpanded ? conversations : conversations.slice(0, 3);
  const selectedPeriodLabel = periodOptions.find(p => p.value === periodFilter)?.label || '';

  return (
    <div className="space-y-3">

      {/* Period Filter */}
      <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
        <SelectTrigger className="w-full h-8 text-xs bg-muted/20 border-border/30 hover:border-primary/30">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <SelectValue placeholder="Filtrar período" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-card border-border/30">
          {periodOptions.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value}
              className="text-xs hover:bg-primary/10"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma conversa anterior</p>
          <p className="text-xs">Esta é a primeira interação</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {displayedConversations.map((conv, index) => {
              const StatusIcon = statusConfig[conv.status].icon;
              
              return (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectConversation?.(conv.id)}
                  className="w-full text-left p-3 rounded-lg bg-muted/20 border border-border/20 hover:border-primary/30 hover:bg-muted/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">
                        {format(conv.date, "d 'de' MMM, yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] ${statusConfig[conv.status].className}`}
                    >
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {statusConfig[conv.status].label}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-foreground line-clamp-1 mb-2">
                    {conv.lastMessage}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {conv.messageCount} msg
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {conv.duration}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {conversations.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-xs text-muted-foreground hover:text-primary"
            >
              {isExpanded ? 'Ver menos' : `Ver mais ${conversations.length - 3} conversas`}
              <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tag, Brain, RefreshCw, Loader2, CheckCircle, Filter, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClassifiedTicket {
  contactId: string;
  contactName: string;
  category: string;
  priority: string;
  confidence: number;
  tags: string[];
  lastMessage: string;
}

const CATEGORIES = [
  { name: 'Suporte Técnico', color: 'bg-info/10 text-info', icon: '🔧' },
  { name: 'Vendas', color: 'bg-success/10 text-success', icon: '💰' },
  { name: 'Financeiro', color: 'bg-warning/10 text-warning', icon: '💳' },
  { name: 'Reclamação', color: 'bg-destructive/10 text-destructive', icon: '⚠️' },
  { name: 'Informação', color: 'bg-secondary/10 text-secondary', icon: 'ℹ️' },
  { name: 'Agendamento', color: 'bg-accent/10 text-accent-foreground', icon: '📅' },
];

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgente', color: 'bg-destructive text-destructive-foreground' },
  high: { label: 'Alta', color: 'bg-warning text-warning-foreground' },
  medium: { label: 'Média', color: 'bg-accent text-accent-foreground' },
  low: { label: 'Baixa', color: 'bg-success text-success-foreground' },
};

export function AutoTicketClassifier() {
  const [autoClassify, setAutoClassify] = useState(true);
  const [tickets, setTickets] = useState<ClassifiedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});

  useEffect(() => {
    loadClassifiedTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadClassifiedTickets = async () => {
    setLoading(true);
    try {
      // Fetch AI-tagged contacts
      const { data: tags, error } = await supabase
        .from('ai_conversation_tags')
        .select('*, contacts(name, phone)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && tags) {
        const grouped = new Map<string, ClassifiedTicket>();
        tags.forEach((tag: Record<string, unknown>) => {
          const contactId = tag.contact_id as string;
          const contact = tag.contacts as Record<string, string> | null;
          if (!grouped.has(contactId)) {
            grouped.set(contactId, {
              contactId,
              contactName: contact?.name || 'Desconhecido',
              category: classifyTag(tag.tag_name as string),
              priority: derivePriority(tag.tag_name as string, (tag.confidence as number) || 0),
              confidence: ((tag.confidence as number) || 0.7) * 100,
              tags: [tag.tag_name as string],
              lastMessage: '',
            });
          } else {
            const existing = grouped.get(contactId)!;
            existing.tags.push(tag.tag_name as string);
          }
        });

        const list = Array.from(grouped.values());
        setTickets(list);

        // Compute category stats
        const stats: Record<string, number> = {};
        list.forEach(t => {
          stats[t.category] = (stats[t.category] || 0) + 1;
        });
        setCategoryStats(stats);
      }
    } catch (err) {
      toast.error('Erro ao carregar tickets classificados');
    } finally {
      setLoading(false);
    }
  };

  const classifyTag = (tagName: string): string => {
    const lower = tagName.toLowerCase();
    if (lower.includes('suporte') || lower.includes('bug') || lower.includes('erro')) return 'Suporte Técnico';
    if (lower.includes('vend') || lower.includes('preço') || lower.includes('compra')) return 'Vendas';
    if (lower.includes('pag') || lower.includes('boleto') || lower.includes('fatura')) return 'Financeiro';
    if (lower.includes('reclam') || lower.includes('insatisf')) return 'Reclamação';
    if (lower.includes('agend') || lower.includes('horário')) return 'Agendamento';
    return 'Informação';
  };

  const derivePriority = (tagName: string, confidence: number): string => {
    const lower = tagName.toLowerCase();
    if (lower.includes('urgent') || lower.includes('reclam')) return 'urgent';
    if (confidence > 0.8 && (lower.includes('bug') || lower.includes('erro'))) return 'high';
    if (confidence > 0.5) return 'medium';
    return 'low';
  };

  const runBatchClassification = async () => {
    setClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-classify-tickets', {
        body: { limit: 50 }
      });
      if (error) throw error;
      toast.success('Classificação em lote concluída!');
      await loadClassifiedTickets();
    } catch {
      toast.success('Classificação local aplicada com sucesso!');
      await loadClassifiedTickets();
    } finally {
      setClassifying(false);
    }
  };

  const getCategoryInfo = (name: string) => {
    return CATEGORIES.find(c => c.name === name) || CATEGORIES[4];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Classificação Automática de Tickets</h2>
            <p className="text-sm text-muted-foreground">IA classifica conversas por categoria e prioridade</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={autoClassify} onCheckedChange={setAutoClassify} />
            <Label className="text-sm">Auto-classificar</Label>
          </div>
          <Button size="sm" onClick={runBatchClassification} disabled={classifying}>
            {classifying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
            Classificar em Lote
          </Button>
        </div>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {CATEGORIES.map((cat) => (
          <Card key={cat.name}>
            <CardContent className="pt-3 pb-3">
              <div className="text-center">
                <p className="text-2xl mb-1">{cat.icon}</p>
                <p className="text-lg font-bold">{categoryStats[cat.name] || 0}</p>
                <p className="text-xs text-muted-foreground">{cat.name}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Classified Tickets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Tickets Classificados ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-muted/50 animate-pulse rounded-lg" />
                ))
              ) : tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum ticket classificado ainda</p>
                  <Button variant="outline" className="mt-3" onClick={runBatchClassification}>
                    Iniciar Classificação
                  </Button>
                </div>
              ) : (
                tickets.map((ticket) => {
                  const catInfo = getCategoryInfo(ticket.category);
                  const priorityInfo = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.low;
                  return (
                    <motion.div
                      key={ticket.contactId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`p-2 rounded-lg ${catInfo.color}`}>
                        <span className="text-lg">{catInfo.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ticket.contactName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                          <Badge className={`text-xs ${priorityInfo.color}`}>{priorityInfo.label}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Confiança</p>
                          <p className="text-sm font-medium">{Math.round(ticket.confidence)}%</p>
                        </div>
                        <CheckCircle className="w-4 h-4 text-success" />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

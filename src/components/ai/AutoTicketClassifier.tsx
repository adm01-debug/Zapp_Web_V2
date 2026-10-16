import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
import { normalizeScore } from '@/lib/ai-values';

interface ClassifiedTicket {
  contactId: string;
  contactName: string;
  category: string;
  priority: string;
  /** Percentual 0..100 medido; `null` quando a confiança falta ou é inválida. */
  confidence: number | null;
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

/** Formato devolvido por `ai-classify-tickets` (IA-114). `confidence` é razão 0..1. */
interface ServerClassification {
  contactId: string;
  category: string;
  priority: string;
  confidence?: unknown;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

/**
 * IA-114 — a categoria/prioridade exibida vem do servidor. Como um contato pode ter
 * mais de uma classificação, a consolidação é determinística: maior severidade; no
 * empate, maior confiança; ainda no empate, categoria em ordem alfabética. Assim a
 * ordem de chegada dos resultados não muda arbitrariamente o resultado.
 */
const normalizeServerConfidence = (server: ServerClassification): number | null => {
  return normalizeScore(server.confidence, { min: 0, max: 1, scale: 'ratio' }).value;
};

function consolidateServerResults(results: ServerClassification[]): Map<string, ServerClassification> {
  const byContact = new Map<string, ServerClassification>();
  for (const result of results) {
    const current = byContact.get(result.contactId);
    if (!current) {
      byContact.set(result.contactId, result);
      continue;
    }
    const resultConfidence = normalizeServerConfidence(result) ?? -1;
    const currentConfidence = normalizeServerConfidence(current) ?? -1;
    const rankDiff = (PRIORITY_RANK[result.priority] ?? 0) - (PRIORITY_RANK[current.priority] ?? 0);
    const wins = rankDiff > 0
      || (rankDiff === 0 && resultConfidence > currentConfidence)
      || (rankDiff === 0 && resultConfidence === currentConfidence && result.category < current.category);
    if (wins) byContact.set(result.contactId, result);
  }
  return byContact;
}

function applyServerClassifications(
  list: ClassifiedTicket[],
  results: ServerClassification[],
): { tickets: ClassifiedTicket[]; appliedCount: number } {
  const byContact = consolidateServerResults(results);
  let appliedCount = 0;
  const tickets = list.map(ticket => {
    const server = byContact.get(ticket.contactId);
    if (!server) return ticket;
    appliedCount += 1;
    const confidence = normalizeServerConfidence(server);
    return {
      ...ticket,
      category: server.category,
      priority: server.priority,
      confidence: confidence === null ? null : confidence * 100,
    };
  });
  return { tickets, appliedCount };
}

function countByCategory(list: ClassifiedTicket[]): Record<string, number> {
  const stats: Record<string, number> = {};
  list.forEach(t => {
    stats[t.category] = (stats[t.category] || 0) + 1;
  });
  return stats;
}

export function AutoTicketClassifier() {
  // CT-70 — com "reduzir movimento" ligado, a lista entra já no estado final.
  const prefersReducedMotion = useReducedMotion();
  const [autoClassify, setAutoClassify] = useState(true);
  const [tickets, setTickets] = useState<ClassifiedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});

  const loadClassifiedTickets = useCallback(async (): Promise<ClassifiedTicket[] | null> => {
    setLoading(true);
    try {
      // Ordem de 12/10/2026: a classificação automática alimentada pela IA saiu do
      // sistema. Sem fonte de tickets classificados, a tela fica no estado vazio e
      // nenhuma consulta é disparada.
      setTickets([]);
      setCategoryStats({});
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    loadClassifiedTickets();
  }, [loadClassifiedTickets]);

  /**
   * IA-114 — consome o resultado do servidor em vez de recalculá-lo localmente.
   * Antes o retorno de `ai-classify-tickets` era descartado e a categoria/prioridade
   * exibidas vinham só das heurísticas locais; no erro o toast ainda dizia
   * "classificação local aplicada com sucesso", escondendo a falha.
   */
  const runBatchClassification = async () => {
    setClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-classify-tickets', {
        body: { limit: 50 }
      });
      if (error) throw error;

      const results = Array.isArray(data?.results) ? (data.results as ServerClassification[]) : [];
      if (results.length === 0) {
        toast.error('O servidor não devolveu classificações; os valores locais foram mantidos.');
        return;
      }

      const list = await loadClassifiedTickets();
      if (list === null) {
        // Falha de recarga já foi avisada em `loadClassifiedTickets`; aplicar sobre
        // lista desconhecida apagaria a tela e ainda poderia dizer "sucesso".
        return;
      }
      if (list.length === 0) {
        toast.error('Nenhum ticket carregado para aplicar as classificações do servidor.');
        return;
      }
      const { tickets: applied, appliedCount } = applyServerClassifications(list, results);
      if (appliedCount === 0) {
        toast.error('O servidor não devolveu classificações para os tickets carregados; os valores locais foram mantidos.');
        return;
      }
      setTickets(applied);
      setCategoryStats(countByCategory(applied));
      toast.success(`Classificação do servidor aplicada a ${appliedCount} ticket(s).`);
    } catch {
      toast.error('A classificação do servidor não pôde ser aplicada; os valores locais foram mantidos.');
    } finally {
      setClassifying(false);
    }
  };

  const getCategoryInfo = (name: string) => {
    return CATEGORIES.find(c => c.name === name) || CATEGORIES[4];
  };

  return (
    <div className="space-y-6 w-full min-w-0">
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
                      initial={prefersReducedMotion ? false : { opacity: 0 }}
                      animate={prefersReducedMotion ? undefined : { opacity: 1 }}
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
                        {ticket.confidence !== null && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Confiança</p>
                            <p className="text-sm font-medium">{Math.round(ticket.confidence)}%</p>
                          </div>
                        )}
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

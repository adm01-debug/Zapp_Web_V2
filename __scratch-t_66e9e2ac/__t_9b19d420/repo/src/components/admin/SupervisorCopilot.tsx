import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Brain, Send, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InsightResult {
  question: string;
  answer: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  'Quais filas estão em risco de SLA?',
  'Quem está com maior backlog?',
  'Quantas conversas estão sem resposta há mais de 1h?',
  'Qual atendente tem melhor performance hoje?',
  'Quais são os motivos de encerramento mais comuns?',
];

interface ManagerialMetrics {
  queueNames: string[];
  activeAgents: Array<{ name: string; role: string }>;
  messagesLast24h: number;
  snapshot: SupervisorSnapshot;
  now: Date;
}

/** Linha do snapshot por fila (RPC supervisor_copilot_snapshot, cartão PG-01R). */
interface QueueSnapshot {
  queueId: string | null;
  queueName: string;
  openConversations: number;
  unansweredOver1h: number;
  slaAtRisk: number;
  slaBreachedToday: number;
}

/** Linha do snapshot por atendente. */
interface AgentSnapshot {
  agentId: string;
  agentName: string;
  openAssigned: number;
  responsesToday: number;
  avgFirstResponseSecondsToday: number | null;
}

interface ClosureReasonSnapshot {
  reason: string;
  count: number;
}

/** Snapshot gerencial medido no banco: é a única fonte dos números do contexto. */
interface SupervisorSnapshot {
  generatedAt: string;
  timezone: string;
  todayStart: string;
  queues: QueueSnapshot[];
  agents: AgentSnapshot[];
  closureReasons7d: ClosureReasonSnapshot[];
  unavailable: Record<string, string>;
}

/**
 * Rótulos pt-BR do que o V2 NÃO mede. O snapshot marca essas lacunas por chave
 * (`unavailable`); aqui elas ganham texto legível — nunca viram número.
 */
const UNAVAILABLE_LABELS: Record<string, string> = {
  csat: 'CSAT (pesquisa de satisfação)',
  nps: 'NPS',
  capacidadeAtendente: 'capacidade por atendente',
  filaEsperaIntegracao: 'fila de espera de integração (Singu)',
};

const FALLBACK_UNAVAILABLE = [
  'CSAT (pesquisa de satisfação)',
  'NPS',
  'capacidade por atendente',
  'fila de espera de integração (Singu)',
];

/**
 * IA-117 — janela da consulta gerencial. Fica fora do corpo do componente para não
 * ler o relógio durante o render (regra react-hooks/purity).
 */
function managerialWindow(): { since: string; now: Date } {
  const now = new Date();
  return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), now };
}

/** Normaliza a resposta do RPC (jsonb) para o contrato do contexto. */
function readSnapshot(raw: unknown): SupervisorSnapshot {
  const value = (raw ?? {}) as Partial<SupervisorSnapshot>;
  return {
    generatedAt: value.generatedAt ?? '',
    timezone: value.timezone ?? 'America/Sao_Paulo',
    todayStart: value.todayStart ?? '',
    queues: Array.isArray(value.queues) ? value.queues : [],
    agents: Array.isArray(value.agents) ? value.agents : [],
    closureReasons7d: Array.isArray(value.closureReasons7d) ? value.closureReasons7d : [],
    unavailable: value.unavailable ?? {},
  };
}

function unavailableLabels(snapshot: SupervisorSnapshot): string[] {
  const keys = Object.keys(snapshot.unavailable ?? {});
  if (keys.length === 0) return FALLBACK_UNAVAILABLE;
  return keys.map((key) => UNAVAILABLE_LABELS[key] ?? key);
}

/** Horário da resposta exibido na tela (o timestamp era guardado e nunca mostrado). */
function formatInsightTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** 402/429 do provedor da IA têm mensagem própria; o resto é indisponibilidade. */
function aiFailureMessage(error: unknown): string {
  const status = (error as { context?: { status?: number }; status?: number } | null)?.context?.status
    ?? (error as { status?: number } | null)?.status;
  if (status === 402 || status === 429) {
    return 'Limite de uso do copiloto atingido. Tente novamente em alguns minutos.';
  }
  return 'O copiloto está indisponível agora. Tente novamente.';
}

/**
 * IA-117 — a resposta gerencial precisa ser reprodutível: o contexto declara a
 * consulta feita, o período, a amostra e o que NÃO foi medido. Antes o prompt só
 * mandava "responder com base nos dados reais" sem dizer quais existiam, e o
 * copiloto respondia sobre SLA, backlog e motivos de encerramento sem base alguma.
 * PG-02 — o snapshot medido no banco (RPC) entra aqui: SLA, backlog por fila,
 * sem resposta >1h e motivos de encerramento deixam de ser lacuna; o que o V2 não
 * registra (CSAT, NPS, capacidade e fila de espera) continua declarado como lacuna.
 */
function buildManagerialContext({ queueNames, activeAgents, messagesLast24h, snapshot, now }: ManagerialMetrics): string {
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const queues = snapshot.queues.length > 0
    ? snapshot.queues.map(q => `  * ${q.queueName}: ${q.openConversations} / ${q.unansweredOver1h} / ${q.slaAtRisk} / ${q.slaBreachedToday}`)
    : ['  * nenhuma fila com conversas abertas'];
  const agents = snapshot.agents.length > 0
    ? snapshot.agents.map(a => `  * ${a.agentName}: ${a.openAssigned} / ${a.responsesToday} / ${a.avgFirstResponseSecondsToday ?? 'sem 1ª resposta hoje'}`)
    : ['  * nenhum atendente ativo'];
  const closureReasons = snapshot.closureReasons7d.length > 0
    ? snapshot.closureReasons7d.map(c => `  * ${c.reason}: ${c.count}`)
    : ['  * nenhum encerramento no período'];

  return [
    'Consulta gerencial (base reproduzível):',
    `- Período: últimas 24h (${periodStart} a ${now.toISOString()})`,
    `- Amostra: ${queueNames.length} fila(s), ${activeAgents.length} agente(s) ativo(s)`,
    `- Mensagens no período: ${messagesLast24h}`,
    `- Filas: ${queueNames.join(', ') || 'nenhuma'}`,
    `- Agentes ativos: ${activeAgents.map(a => `${a.name} (${a.role})`).join(', ') || 'nenhum'}`,
    `- Snapshot por fila (abertas / sem resposta >1h / SLA em risco / SLA estourado hoje — desde ${snapshot.todayStart}, fuso ${snapshot.timezone}):`,
    ...queues,
    '- Snapshot por atendente (abertas atribuídas / 1ªs respostas hoje / tempo médio da 1ª resposta em segundos):',
    ...agents,
    '- Motivos de encerramento (últimos 7 dias):',
    ...closureReasons,
    `Não medido nesta consulta: ${unavailableLabels(snapshot).join(', ')}.`,
  ].join('\n');
}

export function SupervisorCopilot() {
  const [question, setQuestion] = useState('');
  const [insights, setInsights] = useState<InsightResult[]>([]);
  const [loading, setLoading] = useState(false);

  const askQuestion = async (q?: string) => {
    const query = (q ?? question).trim();
    if (!query || loading) return;
    setLoading(true);
    setQuestion('');
    const { since, now } = managerialWindow();

    try {
      // PG-01R — números medidos no banco. Sem a RPC não há snapshot: o pedido
      // para aqui em vez de responder "0" para tudo (falso zero).
      const { data: snapshotData, error: snapshotError } = await supabase.rpc('supervisor_copilot_snapshot');
      if (snapshotError) throw snapshotError;
      const snapshot = readSnapshot(snapshotData);

      // Build context from real data — a consulta, o período e a amostra ficam
      // explícitos no contexto para que a resposta seja reproduzível (IA-117).
      const [queueData, agentData, messageData] = await Promise.all([
        supabase.from('queues').select('id, name').limit(20),
        supabase.from('profiles').select('id, name, role, is_active').eq('is_active', true).limit(50),
        supabase.from('messages').select('id', { count: 'exact', head: true })
          .gte('created_at', since),
      ]);

      const context = buildManagerialContext({
        queueNames: (queueData.data || []).map(q => q.name),
        activeAgents: (agentData.data || []).map(a => ({ name: a.name, role: a.role ?? 'sem papel' })),
        messagesLast24h: messageData.count || 0,
        snapshot,
        now,
      });

      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            { role: 'system', content: `Você é um copiloto de supervisor de atendimento. Responda SOMENTE com as métricas listadas em "Consulta gerencial". Se a pergunta exigir uma métrica marcada como não medida (ou fora da amostra do período), diga explicitamente que o dado não está disponível nesta consulta — não estime nem invente números. Seja conciso e direto. Use bullet points.\n\n${context}` },
            { role: 'user', content: query },
          ],
          model: 'google/gemini-3-flash-preview',
        },
      });

      if (response.error) {
        setInsights(prev => [{
          question: query,
          answer: aiFailureMessage(response.error),
          timestamp: new Date(),
        }, ...prev]);
        setLoading(false);
        return;
      }

      const answer = response.data?.content || response.data?.choices?.[0]?.message?.content || 'Não foi possível processar sua pergunta.';

      setInsights(prev => [{ question: query, answer, timestamp: new Date() }, ...prev]);
    } catch {
      setInsights(prev => [{
        question: query,
        answer: 'Não foi possível carregar as métricas gerenciais agora. Tente novamente.',
        timestamp: new Date(),
      }, ...prev]);
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Copiloto do Supervisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick questions */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              className="h-7 text-3xs"
              title={q}
              onClick={() => askQuestion(q)}
              disabled={loading}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {q.length > 40 ? q.slice(0, 40) + '...' : q}
            </Button>
          ))}
        </div>

        {/* Custom question */}
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunte sobre a operação..."
            className="text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
          />
          <Button
            size="icon"
            aria-label="Perguntar ao copiloto"
            onClick={() => askQuestion()}
            disabled={loading || !question.trim()}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Results */}
        <AnimatePresence mode="popLayout">
          {insights.map((insight) => (
            <motion.div
              key={`${insight.question}-${insight.timestamp.getTime()}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border/30"
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{insight.question}</p>
                  <p className="text-3xs text-muted-foreground">{formatInsightTime(insight.timestamp)}</p>
                </div>
              </div>
              <div className="pl-6">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{insight.answer}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

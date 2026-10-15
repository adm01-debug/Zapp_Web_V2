import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap, Play, MessageSquare, Send, Bot, User, CheckCircle2, XCircle, Award } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Json } from '@/integrations/supabase/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserRole } from '@/hooks/system/useUserRole';

interface SimMessage {
  role: 'customer' | 'agent';
  content: string;
}

interface TrainingSession {
  id: string;
  scenario_name: string;
  status: string;
  score: number | null;
  created_at?: string;
}

/** Rótulos dos estados usados em `training_sessions.status` (coluna TEXT, sem CHECK). */
const STATUS_SESSAO: Record<string, string> = {
  in_progress: 'Em andamento',
  completed: 'Concluído',
  abandoned: 'Abandonada',
};

const SCENARIOS = [
  { name: 'Reclamação sobre entrega', type: 'support', customerScript: [
    'Boa tarde, meu pedido não chegou e já passaram 5 dias.',
    'Paguei pelo frete expresso e ainda não recebi!',
    'Quero meu dinheiro de volta ou vou reclamar no Reclame Aqui.',
  ]},
  { name: 'Dúvida sobre produto', type: 'sales', customerScript: [
    'Olá, vi o produto X no site. Tem disponível?',
    'Qual a diferença entre o modelo básico e o premium?',
    'Tem desconto para pagamento à vista?',
  ]},
  { name: 'Solicitação de suporte técnico', type: 'support', customerScript: [
    'Não consigo acessar minha conta, aparece erro 403.',
    'Já tentei limpar o cache e não funcionou.',
    'Preciso urgente porque tenho uma reunião em 30 minutos.',
  ]},
  { name: 'Negociação de preço', type: 'sales', customerScript: [
    'Recebi a proposta mas está acima do nosso orçamento.',
    'O concorrente ofereceu 20% mais barato.',
    'Se fizerem um preço melhor, fechamos agora.',
  ]},
];

/**
 * Avaliação do Modo Treinamento: a nota sai do que o atendente ESCREVEU.
 *
 * Antes esta nota era sorteada (`Math.random()`, depois `secureRandomFloat()`) e o
 * número era gravado em `training_sessions.score` com um feedback falando em "boa
 * empatia e resolução" — avaliação de desempenho que não media nada (R2-AUTH-037).
 *
 * Agora cada resposta do atendente é medida em três critérios observáveis no texto e a
 * nota é a fração de critérios atendidos, na mesma faixa 40..100 que a tela já usava.
 * Mesmo texto => mesma nota. É uma heurística de texto (não há modelo de linguagem
 * aqui), e o feedback diz exatamente qual critério faltou.
 */
const CRITERIOS_TREINAMENTO = ['detalhe', 'acao', 'empatia'] as const;
type CriterioTreinamento = (typeof CRITERIOS_TREINAMENTO)[number];

const FALTAS: Record<CriterioTreinamento, string> = {
  detalhe: 'detalhar mais a resposta',
  acao: 'declarar o próximo passo',
  empatia: 'reconhecer a situação do cliente',
};

/** Resposta desenvolvida (não monossílabo). */
const MIN_DETALHE = 60;
/** Assume o caso e diz o que vai fazer. */
const RE_ACAO = /\b(vou|irei|vamos|encaminh\w*|verific\w*|resolv\w*|solucion\w*|providenci\w*|ajust\w*|chec\w*|analis\w*)\b/i;
/** Reconhece a situação do cliente. */
const RE_EMPATIA = /\b(entendo|entendi|compreendo|compreendi|desculpe|desculpa|sinto muito|lamento|imagino)\b/i;

function criteriosAtendidos(resposta: string): CriterioTreinamento[] {
  const texto = resposta.trim();
  const atendidos: CriterioTreinamento[] = [];
  if (texto.length >= MIN_DETALHE) atendidos.push('detalhe');
  if (RE_ACAO.test(texto)) atendidos.push('acao');
  if (RE_EMPATIA.test(texto)) atendidos.push('empatia');
  return atendidos;
}

function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function avaliarTreinamento(respostasDoAtendente: string[]): { score: number; feedback: string } {
  if (respostasDoAtendente.length === 0) {
    return { score: 40, feedback: 'Nenhuma resposta do atendente foi registrada nesta sessão.' };
  }

  const total = CRITERIOS_TREINAMENTO.length * respostasDoAtendente.length;
  const atendidos = respostasDoAtendente.reduce((soma, r) => soma + criteriosAtendidos(r).length, 0);
  const score = Math.min(100, Math.max(40, 40 + Math.round((60 * atendidos) / total)));

  if (score >= 80) {
    return { score, feedback: 'Excelente! Respostas completas, com empatia e próximo passo claro.' };
  }

  const faltando = CRITERIOS_TREINAMENTO.filter(c => !respostasDoAtendente.every(r => criteriosAtendidos(r).includes(c)))
    .map(c => FALTAS[c]);
  const prefixo = score >= 60 ? 'Bom, mas faltou' : 'Precisa melhorar: faltou';
  return { score, feedback: `${prefixo} ${listar(faltando)}.` };
}

export function TrainingMode() {
  const { isSupervisor, loading: papelCarregando } = useUserRole();
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [scenario, setScenario] = useState<typeof SCENARIOS[0] | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState('');
  const [customerStep, setCustomerStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Falhas visíveis: perfil, início da sessão e leitura das sessões anteriores.
  // Antes o `return` silencioso deixava o atendente digitando no vazio.
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  // Resultados da equipe (admin/supervisor): lê o que a RLS já libera para esses papéis.
  const [aba, setAba] = useState('meus');
  const [sessoesEquipe, setSessoesEquipe] = useState<TrainingSession[]>([]);
  const [erroEquipe, setErroEquipe] = useState<string | null>(null);
  // A aba da equipe começa sem nada buscado: enquanto não carregou, a tela mostra
  // "carregando" em vez do "nenhuma sessão" (que afirmaria um vazio não verificado).
  const [equipeCarregada, setEquipeCarregada] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErroPerfil('Sua sessão expirou. Entre novamente para usar o Modo Treinamento.');
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      setErroPerfil('Não foi possível carregar o seu perfil. Recarregue a página e tente de novo.');
      return;
    }
    if (!data) {
      setErroPerfil('Seu usuário não tem perfil cadastrado, por isso o treinamento não pode ser iniciado.');
      return;
    }
    setErroPerfil(null);
    setProfileId(data.id);
  }, []);

  const loadSessions = useCallback(async () => {
    if (!profileId) return;
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      setErroLista('Não foi possível carregar as suas sessões de treinamento.');
      return;
    }
    setErroLista(null);
    setSessions((data ?? []) as TrainingSession[]);
  }, [profileId]);

  /** Sessões de todos os atendentes — só chega aqui para admin/supervisor (RLS + aba). */
  const loadTeamSessions = useCallback(async () => {
    // Padrão é negar: sem o papel de supervisão (ou com o papel ainda carregando)
    // a consulta da equipe nem é emitida.
    if (papelCarregando || !isSupervisor) return;
    const { data, error } = await supabase
      .from('training_sessions')
      .select('id, scenario_name, status, score, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setErroEquipe('Não foi possível carregar os resultados da equipe.');
      setEquipeCarregada(true);
      return;
    }
    setErroEquipe(null);
    setSessoesEquipe((data ?? []) as TrainingSession[]);
    setEquipeCarregada(true);
  }, [papelCarregando, isSupervisor]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileId) {
      loadSessions();
    }
  }, [profileId, loadSessions]);

  const startScenario = async (s: typeof SCENARIOS[0]) => {
    if (!profileId) {
      setErroSessao('O seu perfil ainda não carregou. Aguarde um instante e tente de novo.');
      return;
    }
    setErroSessao(null);
    setScenario(s);
    setCustomerStep(0);
    setScore(null);
    setFeedback('');
    const firstMsg: SimMessage = { role: 'customer', content: s.customerScript[0] };
    setMessages([firstMsg]);
    setCustomerStep(1);

    const { data, error } = await supabase.from('training_sessions').insert({
      profile_id: profileId,
      scenario_name: s.name,
      scenario_type: s.type,
      messages: [firstMsg] as unknown as Json,
      status: 'in_progress',
    }).select('id').single();
    if (error || !data) {
      // Sem id de sessão não há onde gravar as respostas: avisa e deixa o botão
      // Enviar desabilitado, em vez de aceitar texto que seria perdido.
      setActiveSession(null);
      setErroSessao('Não foi possível iniciar o treinamento. Tente novamente em instantes.');
      return;
    }
    setActiveSession(data.id);
  };

  /** Sai do cenário: sessão em andamento vira `abandoned` para não ficar presa. */
  const encerrarSessao = async () => {
    const sessao = activeSession;
    setScenario(null);
    setMessages([]);
    setInput('');
    setActiveSession(null);
    setErroSessao(null);
    if (!sessao) return;
    const { error } = await supabase
      .from('training_sessions')
      .update({ status: 'abandoned' })
      .eq('id', sessao);
    if (error) {
      setErroSessao('Não foi possível registrar o encerramento da sessão de treinamento.');
      return;
    }
    loadSessions();
  };

  const sendResponse = async () => {
    if (!input.trim() || !scenario) return;
    if (!activeSession) {
      setErroSessao('A sessão de treinamento não está ativa. Saia e inicie o cenário novamente.');
      return;
    }
    const agentMsg: SimMessage = { role: 'agent', content: input.trim() };
    const newMessages = [...messages, agentMsg];
    setInput('');

    // Customer responds if there are more steps
    if (customerStep < scenario.customerScript.length) {
      const customerMsg: SimMessage = { role: 'customer', content: scenario.customerScript[customerStep] };
      newMessages.push(customerMsg);
      setCustomerStep(prev => prev + 1);
    }
    setMessages(newMessages);

    await supabase.from('training_sessions').update({
      messages: newMessages as unknown as Json,
    }).eq('id', activeSession);

    // Complete if all steps done
    if (customerStep >= scenario.customerScript.length) {
      // Nota do treinamento: vem das respostas que o atendente escreveu (critérios em
      // `avaliarTreinamento`), inteiro na faixa 40..100, gravado em
      // `training_sessions.score` — nada de sorteio (R2-AUTH-037).
      const respostasDoAtendente = newMessages.filter(m => m.role === 'agent').map(m => m.content);
      const { score: finalScore, feedback: fb } = avaliarTreinamento(respostasDoAtendente);
      setScore(finalScore);
      setFeedback(fb);

      await supabase.from('training_sessions').update({
        score: finalScore,
        feedback: fb,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', activeSession);

      loadSessions();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          Modo Treinamento
        </h2>
        <p className="text-sm text-muted-foreground">Simulador de atendimento para novos agentes</p>
      </div>

      {!scenario ? (
        <Tabs
          value={aba}
          onValueChange={(valor) => {
            setAba(valor);
            // Único ponto de chamada: só a escolha da aba dispara a busca (o
            // Radix não emite onValueChange na montagem, que abre em "meus").
            if (valor === 'equipe') loadTeamSessions();
          }}
          className="space-y-3"
        >
          <TabsList aria-label="Resultados do treinamento">
            <TabsTrigger value="meus">Meus resultados</TabsTrigger>
            {isSupervisor && <TabsTrigger value="equipe">Resultados da equipe</TabsTrigger>}
          </TabsList>
          <TabsContent value="meus" className="space-y-3">
          {erroPerfil && <p role="alert" className="text-xs text-destructive">{erroPerfil}</p>}
          {erroLista && <p role="alert" className="text-xs text-destructive">{erroLista}</p>}
          {erroSessao && <p role="alert" className="text-xs text-destructive">{erroSessao}</p>}
          {/* Scenario selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCENARIOS.map((s, idx) => (
              <motion.div key={s.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => startScenario(s)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">{s.name}</h3>
                      <Badge variant="outline" className="text-3xs">{s.type === 'sales' ? 'Vendas' : 'Suporte'}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.customerScript.length} interações simuladas</p>
                    <Button size="sm" variant="outline" className="mt-3 h-7 text-xs w-full">
                      <Play className="w-3 h-3 mr-1" /> Iniciar
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Past sessions */}
          {sessions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Sessões anteriores</h3>
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <div>
                    <p className="text-xs font-medium">{s.scenario_name}</p>
                    <p className="text-3xs text-muted-foreground">{STATUS_SESSAO[s.status] ?? s.status}</p>
                  </div>
                  {s.score && (
                    <Badge variant={s.score >= 80 ? 'default' : 'outline'} className="text-xs">
                      <Award className="w-3 h-3 mr-1" /> {s.score}/100
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          </TabsContent>
          {isSupervisor && (
            <TabsContent value="equipe" className="space-y-2">
              {erroEquipe && <p role="alert" className="text-xs text-destructive">{erroEquipe}</p>}
              {!equipeCarregada ? (
                <p className="text-xs text-muted-foreground">Carregando resultados da equipe…</p>
              ) : sessoesEquipe.length === 0 ? (
                !erroEquipe && <p className="text-xs text-muted-foreground">Nenhuma sessão de treinamento registrada.</p>
              ) : (
                sessoesEquipe.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                    <div>
                      <p className="text-xs font-medium">{s.scenario_name}</p>
                      <p className="text-3xs text-muted-foreground">
                        {STATUS_SESSAO[s.status] ?? s.status}
                        {s.created_at ? ` · ${new Date(s.created_at).toLocaleDateString('pt-BR')}` : ''}
                      </p>
                    </div>
                    {typeof s.score === 'number' && (
                      <Badge variant={s.score >= 80 ? 'default' : 'outline'} className="text-xs">
                        <Award className="w-3 h-3 mr-1" /> {s.score}/100
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          )}
        </Tabs>
      ) : (
        /* Active simulation */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{scenario.name}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={encerrarSessao}>
                Sair
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Messages */}
            <div className="space-y-2 max-h-80 overflow-y-auto" role="log" aria-label="Conversa do treinamento" aria-live="polite">
              <AnimatePresence>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${msg.role === 'agent' ? 'justify-end' : ''}`}
                  >
                    {msg.role === 'customer' && <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />}
                    <div className={`p-2.5 rounded-xl max-w-[80%] text-xs ${
                      msg.role === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-muted/30'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'agent' && <User className="w-5 h-5 text-primary shrink-0 mt-1" />}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Score result */}
            {score !== null ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-muted/20 text-center space-y-2">
                <div className={`text-3xl font-bold ${score >= 80 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-destructive'}`}>
                  {score}/100
                </div>
                <p className="text-sm">{feedback}</p>
                <Button size="sm" onClick={() => { setScenario(null); setMessages([]); setActiveSession(null); }}>
                  Novo cenário
                </Button>
              </motion.div>
            ) : (
              /* Input */
              <div className="space-y-2">
                {erroSessao && <p role="alert" className="text-xs text-destructive">{erroSessao}</p>}
                <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Responda como atendente..."
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && sendResponse()}
                />
                <Button size="icon" onClick={sendResponse} disabled={!input.trim() || !activeSession} aria-label="Enviar resposta">
                  <Send className="w-4 h-4" />
                </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

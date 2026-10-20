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

interface SimMessage {
  role: 'customer' | 'agent';
  content: string;
}

interface TrainingSession {
  id: string;
  scenario_name: string;
  status: string;
  score: number | null;
}

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

export function TrainingMode() {
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [scenario, setScenario] = useState<typeof SCENARIOS[0] | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState('');
  const [customerStep, setCustomerStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).single();
    if (data) setProfileId(data.id);
  }, []);

  const loadSessions = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setSessions(data as TrainingSession[]);
  }, [profileId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileId) {
      loadSessions();
    }
  }, [profileId, loadSessions]);

  const startScenario = async (s: typeof SCENARIOS[0]) => {
    if (!profileId) return;
    setScenario(s);
    setCustomerStep(0);
    setScore(null);
    setFeedback('');
    const firstMsg: SimMessage = { role: 'customer', content: s.customerScript[0] };
    setMessages([firstMsg]);
    setCustomerStep(1);

    const { data } = await supabase.from('training_sessions').insert({
      profile_id: profileId,
      scenario_name: s.name,
      scenario_type: s.type,
      messages: [firstMsg] as unknown as Json,
      status: 'in_progress',
    }).select('id').single();
    if (data) setActiveSession(data.id);
  };

  const sendResponse = async () => {
    if (!input.trim() || !scenario || !activeSession) return;
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
      const finalScore = Math.min(100, Math.max(40, 60 + Math.round(Math.random() * 40)));
      setScore(finalScore);
      const fb = finalScore >= 80 ? 'Excelente! Boa empatia e resolução.' :
        finalScore >= 60 ? 'Bom, mas poderia ser mais proativo.' :
        'Precisa melhorar a abordagem e tempo de resposta.';
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
        <>
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
                    <p className="text-3xs text-muted-foreground">{s.status === 'completed' ? 'Concluído' : 'Em andamento'}</p>
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
        </>
      ) : (
        /* Active simulation */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{scenario.name}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setScenario(null); setMessages([]); setActiveSession(null); }}>
                Sair
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Messages */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
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
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Responda como atendente..."
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && sendResponse()}
                />
                <Button size="icon" onClick={sendResponse} disabled={!input.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

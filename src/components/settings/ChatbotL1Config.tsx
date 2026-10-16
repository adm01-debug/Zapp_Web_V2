import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactPicker, type ContatoEscolhido } from '@/components/calls/ContactPicker';
import { toast } from '@/hooks/ui/use-toast';
import { Bot, Brain, Shield, Zap, BookOpen, ArrowRightLeft, Play } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { CONFIANCA_PADRAO, normalizarConfianca } from '@/lib/chatbotConfianca';

type ChatbotFlow = Database['public']['Tables']['chatbot_flows']['Row'];

const DEFAULT_NAME = 'Chatbot IA L1';
const DEFAULT_WELCOME = 'Olá! Sou o assistente virtual. Como posso ajudá-lo hoje?';
const DEFAULT_TRANSFER = 'Vou transferir você para um de nossos atendentes. Um momento, por favor.';
const DEFAULT_TEST_MESSAGE = 'Olá, gostaria de saber o prazo de entrega.';

interface FormValues {
  isActive: boolean;
  name: string;
  confidenceThreshold: number;
  welcomeMessage: string;
  transferMessage: string;
}

/** Resposta (dry-run) da Edge `chatbot-l1` — ver supabase/functions/chatbot-l1/index.ts. */
interface SimulacaoResposta {
  handled?: boolean;
  reason?: string;
  response?: string;
  transfer_to_human?: boolean;
  transfer_reason?: string | null;
  confidence?: number | null;
  matched_article?: string | null;
}

/**
 * Motivo bruto da Edge -> texto em pt-BR. A Edge responde 200 com `handled:false`
 * e um `reason` quando não produz resposta (nada ativo na conexão, contato fora
 * do escopo de quem pergunta, limite de IA, saída inválida do modelo): cada um
 * tem uma saída diferente, e mostrar "erro" genérico esconderia a causa real.
 */
const MOTIVO_SEM_RESPOSTA: Record<string, string> = {
  no_active_flow: 'Não há fluxo ativo para esta conexão. Salve a configuração com o chatbot ativado.',
  contact_not_visible: 'Você não tem acesso a este contato.',
  rate_limit: 'Limite de uso da IA atingido. Tente de novo em alguns minutos.',
  parse_error: 'O robô devolveu uma resposta em formato inesperado. Tente de novo.',
  invalid_output: 'O robô devolveu uma resposta incompleta. Tente de novo.',
};

/**
 * Valores iniciais do formulário a partir do fluxo carregado (ou dos padrões,
 * quando a conexão ainda não tem fluxo `ai_l1`). Um fluxo por conexão: quem
 * escolhe a conexão é o seletor no topo, e a leitura é sempre a daquela conexão.
 */
function valoresDoFluxo(flow: ChatbotFlow | null | undefined): FormValues {
  const vars = (flow?.variables ?? null) as Record<string, unknown> | null;
  return {
    isActive: flow?.is_active ?? false,
    name: flow?.name ?? DEFAULT_NAME,
    confidenceThreshold: normalizarConfianca(vars?.confidence_threshold, CONFIANCA_PADRAO),
    welcomeMessage: typeof vars?.welcome_message === 'string' ? vars.welcome_message : DEFAULT_WELCOME,
    transferMessage: typeof vars?.transfer_message === 'string' ? vars.transfer_message : DEFAULT_TRANSFER,
  };
}

export function ChatbotL1Config() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Sem conexão escolhida nada é lido nem gravado: o fluxo `ai_l1` é por conexão
  // (a Edge filtra por `whatsapp_connection_id`) e não existe "configuração geral".
  const [connectionId, setConnectionId] = useState('');

  const { data: connections = [], isError: erroConexoes } = useQuery({
    queryKey: ['whatsapp-connections-chatbot-l1'],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_connections').select('id, name, status').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: flow, isFetching: flowFetching, isError: erroFluxo } = useQuery({
    queryKey: ['chatbot-l1-flow', connectionId],
    enabled: !!connectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chatbot_flows')
        .select('*')
        .eq('trigger_type', 'ai_l1')
        .eq('whatsapp_connection_id', connectionId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: kbCount = 0 } = useQuery({
    queryKey: ['kb-article-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('knowledge_base_articles')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true);
      if (error) throw error;
      return count || 0;
    },
  });

  // Rascunho do formulário derivado do fluxo carregado: o estado guardado é só a
  // EDIÇÃO do usuário e vale apenas para a chave da conexão/fluxo atual. Trocar de
  // conexão descarta a edição e redesenha a partir do fluxo dela — sem `setState`
  // dentro de efeito.
  const formKey = `${connectionId}:${flow?.id ?? ''}`;
  const [edits, setEdits] = useState<{ key: string; values: Partial<FormValues> }>({ key: '', values: {} });
  const form: FormValues = { ...valoresDoFluxo(flow), ...(edits.key === formKey ? edits.values : {}) };

  const setField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    const atuais = edits.key === formKey ? edits.values : {};
    setEdits({ key: formKey, values: { ...atuais, [field]: value } });
  };

  // Conexão cujo fluxo acabou de ser CRIADO e ainda não voltou na leitura:
  // o Salvar segue bloqueado até o fluxo chegar, para não empilhar um
  // segundo insert duplicado. Amarrado à conexão (trocar de conexão libera).
  const [fluxoCriadoEm, setFluxoCriadoEm] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!connectionId) throw new Error('Escolha a conexão de WhatsApp.');
      // Fora da faixa do controle não é gravado: volta ao valor salvo atual
      // da conexão (ou ao padrão, se não houver).
      const salvoAtual = valoresDoFluxo(flow).confidenceThreshold;
      const variables = {
        confidence_threshold: normalizarConfianca(form.confidenceThreshold, salvoAtual),
        welcome_message: form.welcomeMessage,
        transfer_message: form.transferMessage,
      };

      if (flow?.id) {
        const { error } = await supabase.from('chatbot_flows').update({
          name: form.name,
          is_active: form.isActive,
          variables,
          whatsapp_connection_id: connectionId,
          updated_at: new Date().toISOString(),
        }).eq('id', flow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chatbot_flows').insert({
          name: form.name,
          is_active: form.isActive,
          trigger_type: 'ai_l1',
          trigger_value: 'auto',
          variables,
          nodes: [],
          edges: [],
          created_by: profile?.id,
          whatsapp_connection_id: connectionId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Criou agora (não havia fluxo) e a leitura ainda não voltou: trava o
      // botão até o fluxo chegar. Atualização de fluxo existente não trava.
      if (!flow?.id) setFluxoCriadoEm(connectionId);
      queryClient.invalidateQueries({ queryKey: ['chatbot-l1-flow'] });
      toast({ title: 'Chatbot IA salvo!', description: 'O assistente L1 foi configurado para esta conexão.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  // Simulação (dry-run): chama a Edge `chatbot-l1` como o webhook chamaria, mas o
  // caminho da Edge só PRODUZ a resposta — quem envia mensagem é quem a chama, e
  // esta tela não envia. Por isso é seguro testar com um contato real.
  const [contatoTeste, setContatoTeste] = useState<ContatoEscolhido | null>(null);
  const [mensagemTeste, setMensagemTeste] = useState(DEFAULT_TEST_MESSAGE);
  const [simulando, setSimulando] = useState(false);
  const [simulacao, setSimulacao] = useState<SimulacaoResposta | null>(null);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);

  const simular = async () => {
    setSimulacao(null);
    setErroSimulacao(null);

    if (!connectionId) {
      setErroSimulacao('Escolha a conexão de WhatsApp antes de simular.');
      return;
    }
    if (!contatoTeste) {
      setErroSimulacao('Escolha um contato para a simulação.');
      return;
    }
    const texto = mensagemTeste.trim();
    if (!texto) {
      setErroSimulacao('Escreva a mensagem que o cliente enviaria.');
      return;
    }

    setSimulando(true);
    try {
      const { data, error } = await supabase.functions.invoke('chatbot-l1', {
        body: { contactId: contatoTeste.id, message: texto, connectionId },
      });
      if (error) throw error;
      const resposta = (data ?? {}) as SimulacaoResposta;
      if (!resposta.response && resposta.reason) {
        setErroSimulacao(MOTIVO_SEM_RESPOSTA[resposta.reason] ?? 'O robô não respondeu a esta simulação.');
      } else if (!resposta.response) {
        setErroSimulacao('O robô não produziu resposta para esta mensagem.');
      } else {
        setSimulacao(resposta);
      }
    } catch (err: unknown) {
      setErroSimulacao(err instanceof Error ? err.message : 'Não foi possível falar com o robô. Tente de novo.');
    } finally {
      setSimulando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Chatbot IA Generativa (L1)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Atendimento automático inteligente que responde com base na Base de Conhecimento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Conexão do chatbot
          </CardTitle>
          <CardDescription>
            Cada conexão de WhatsApp tem o seu próprio fluxo de chatbot. Escolha a conexão para
            configurar e testar o atendimento dela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="chatbot-l1-conexao">Conexão WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="chatbot-l1-conexao" aria-label="Conexão WhatsApp">
                <SelectValue placeholder="Selecione a conexão" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {erroConexoes && (
            <p role="alert" className="text-xs text-destructive">
              Não foi possível carregar as conexões de WhatsApp. Recarregue a página e tente de novo.
            </p>
          )}

          {!connectionId && (
            <p className="text-xs text-muted-foreground">
              Nenhuma conexão escolhida: nada é ligado nem gravado até você escolher uma.
            </p>
          )}
          {erroFluxo && (
            <p role="alert" className="text-xs text-destructive">
              Não foi possível carregar a configuração desta conexão. Recarregue a página e tente de
              novo.
            </p>
          )}
          {connectionId && !flowFetching && !erroFluxo && !flow && (
            <p className="text-xs text-muted-foreground">
              Esta conexão ainda não tem chatbot configurado. Ao salvar, um fluxo novo é criado
              para ela.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{kbCount}</p>
              <p className="text-xs text-muted-foreground">Artigos na KB</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{form.confidenceThreshold}%</p>
              <p className="text-xs text-muted-foreground">Confiança Mínima</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.isActive ? 'bg-success/10' : 'bg-muted'}`}>
              <Zap className={`w-5 h-5 ${form.isActive ? 'text-success' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{form.isActive ? 'Ativo' : 'Inativo'}</p>
              <p className="text-xs text-muted-foreground">Status do Bot</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Configuração do Chatbot
          </CardTitle>
          <CardDescription>
            O chatbot usará a Base de Conhecimento para responder automaticamente. Se não tiver certeza, transfere para humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Ativar Chatbot IA L1</Label>
              <p className="text-xs text-muted-foreground">Responder automaticamente novas mensagens</p>
            </div>
            <Switch aria-label="Ativar Chatbot IA L1" checked={form.isActive} onCheckedChange={(v) => setField('isActive', v)} />
          </div>

          <div className="space-y-2">
            <Label>Nome do Bot</Label>
            <Input aria-label="Nome do Bot" value={form.name} onChange={e => setField('name', e.target.value)} />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Nível de Confiança Mínimo
              </span>
              <Badge variant="outline">{form.confidenceThreshold}%</Badge>
            </Label>
            <Slider
              thumbLabel="Nível de Confiança Mínimo"
              value={[form.confidenceThreshold]}
              onValueChange={v => setField('confidenceThreshold', v[0])}
              min={30}
              max={95}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Abaixo deste nível, a conversa é transferida para um humano automaticamente.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem de Boas-vindas</Label>
            <Textarea aria-label="Mensagem de Boas-vindas" value={form.welcomeMessage} onChange={e => setField('welcomeMessage', e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Mensagem de Transferência
            </Label>
            <Textarea aria-label="Mensagem de Transferência" value={form.transferMessage} onChange={e => setField('transferMessage', e.target.value)} rows={2} />
            <p className="text-xs text-muted-foreground">
              Enviada quando o bot decide transferir para um atendente humano.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
            <p className="text-xs font-medium">Como funciona:</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. 📩 Cliente envia mensagem</p>
              {kbCount === 0 ? (
                <p>2. 🤖 Publique ao menos 1 artigo na Base de Conhecimento para o robô ter o que responder.</p>
              ) : (
                <p>2. 🤖 IA analisa usando a Base de Conhecimento ({kbCount} artigos)</p>
              )}
              <p>3. ✅ Se confiança ≥ {form.confidenceThreshold}% → Responde automaticamente</p>
              <p>4. 🔄 Se confiança {'<'} {form.confidenceThreshold}% → Transfere para humano</p>
            </div>
          </div>

          {/* Travado sem conexão, durante o salvamento e logo após criar o
              fluxo novo (até a leitura trazer o fluxo e evitar duplicata). */}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending ||
              !connectionId ||
              (fluxoCriadoEm !== '' && fluxoCriadoEm === connectionId && !flow?.id && !erroFluxo)
            }
            className="w-full"
          >
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4" />
            Simulação de atendimento
          </CardTitle>
          <CardDescription>
            Mostra a resposta que o robô daria para uma mensagem, sem enviar nada pelo WhatsApp.
            O robô responde apenas conversas que ainda não estão com um atendente humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Contato da simulação</Label>
            <ContactPicker
              selecionado={contatoTeste}
              onEscolher={setContatoTeste}
              onLimpar={() => setContatoTeste(null)}
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem do cliente</Label>
            <Textarea
              aria-label="Mensagem do cliente"
              value={mensagemTeste}
              onChange={e => setMensagemTeste(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={simular}
            disabled={simulando || !connectionId}
            className="w-full"
          >
            {simulando ? 'Simulando...' : 'Simular resposta'}
          </Button>

          {!connectionId && (
            <p className="text-xs text-muted-foreground">
              Escolha a conexão acima para poder simular.
            </p>
          )}

          {erroSimulacao && (
            <p role="alert" className="text-sm text-destructive">
              {erroSimulacao}
            </p>
          )}

          {simulacao && (
            <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
              <p className="text-xs font-medium">Resposta que o robô daria:</p>
              <p className="text-sm whitespace-pre-wrap">{simulacao.response}</p>
              <div className="flex flex-wrap gap-2">
                {typeof simulacao.confidence === 'number' && (
                  <Badge variant="outline">Confiança: {Math.round(simulacao.confidence * 100)}%</Badge>
                )}
                {simulacao.matched_article && (
                  <Badge variant="outline">Artigo: {simulacao.matched_article}</Badge>
                )}
                {simulacao.transfer_to_human && (
                  <Badge variant="destructive">Transferiria para atendente</Badge>
                )}
              </div>
              {simulacao.transfer_to_human && (
                <p className="text-xs text-muted-foreground">
                  {form.transferMessage} (motivo: {simulacao.transfer_reason ?? 'não informado'})
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

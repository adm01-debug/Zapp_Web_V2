import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/ui/use-toast';
import { Bot, Brain, Shield, Zap, BookOpen, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';

export function ChatbotL1Config() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: flow, isLoading } = useQuery({
    queryKey: ['chatbot-l1-flow'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chatbot_flows')
        .select('*')
        .eq('trigger_type', 'ai_l1')
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: kbCount = 0 } = useQuery({
    queryKey: ['kb-article-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('knowledge_base_articles')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true);
      return count || 0;
    },
  });

  const [isActive, setIsActive] = useState(false);
  const [name, setName] = useState('Chatbot IA L1');
  const [confidenceThreshold, setConfidenceThreshold] = useState(60);
  const [welcomeMessage, setWelcomeMessage] = useState(
    'Olá! Sou o assistente virtual. Como posso ajudá-lo hoje?'
  );
  const [transferMessage, setTransferMessage] = useState(
    'Vou transferir você para um de nossos atendentes. Um momento, por favor.'
  );

  // Sync state when flow data loads
  useEffect(() => {
    if (flow) {
      setIsActive(flow.is_active ?? false);
      setName(flow.name ?? 'Chatbot IA L1');
      const vars = flow.variables as Record<string, any> | null;
      if (vars) {
        if (vars.confidence_threshold) setConfidenceThreshold(vars.confidence_threshold);
        if (vars.welcome_message) setWelcomeMessage(vars.welcome_message);
        if (vars.transfer_message) setTransferMessage(vars.transfer_message);
      }
    }
  }, [flow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const variables = {
        confidence_threshold: confidenceThreshold,
        welcome_message: welcomeMessage,
        transfer_message: transferMessage,
      };

      if (flow?.id) {
        const { error } = await supabase.from('chatbot_flows').update({
          name,
          is_active: isActive,
          variables,
          updated_at: new Date().toISOString(),
        }).eq('id', flow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chatbot_flows').insert({
          name,
          is_active: isActive,
          trigger_type: 'ai_l1',
          trigger_value: 'auto',
          variables,
          nodes: [],
          edges: [],
          created_by: profile?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-l1-flow'] });
      toast({ title: 'Chatbot IA salvo!', description: 'O assistente L1 foi configurado com sucesso.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

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
              <p className="text-2xl font-bold">{confidenceThreshold}%</p>
              <p className="text-xs text-muted-foreground">Confiança Mínima</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-success/10' : 'bg-muted'}`}>
              <Zap className={`w-5 h-5 ${isActive ? 'text-success' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{isActive ? 'Ativo' : 'Inativo'}</p>
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
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>Nome do Bot</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Nível de Confiança Mínimo
              </span>
              <Badge variant="outline">{confidenceThreshold}%</Badge>
            </Label>
            <Slider
              value={[confidenceThreshold]}
              onValueChange={v => setConfidenceThreshold(v[0])}
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
            <Textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Mensagem de Transferência
            </Label>
            <Textarea value={transferMessage} onChange={e => setTransferMessage(e.target.value)} rows={2} />
            <p className="text-xs text-muted-foreground">
              Enviada quando o bot decide transferir para um atendente humano.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
            <p className="text-xs font-medium">Como funciona:</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. 📩 Cliente envia mensagem</p>
              <p>2. 🤖 IA analisa usando a Base de Conhecimento ({kbCount} artigos)</p>
              <p>3. ✅ Se confiança ≥ {confidenceThreshold}% → Responde automaticamente</p>
              <p>4. 🔄 Se confiança {'<'} {confidenceThreshold}% → Transfere para humano</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('chatbot-l1', {
                    body: { contactId: 'test', message: 'Olá, teste de conexão', connectionId: 'test' },
                  });
                  if (error) throw error;
                  toast({ title: '✅ Conexão OK', description: 'Edge Function chatbot-l1 está acessível.' });
                } catch (err: unknown) {
                  toast({ title: 'Status', description: err instanceof Error ? err.message : 'Verificação concluída', variant: 'destructive' });
                }
              }}
            >
              Testar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/ui/use-toast';
import { MessageSquareHeart, Clock, Send, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';

const DEFAULT_MESSAGE_TEMPLATE = 'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐\n\n1️⃣ Péssimo\n2️⃣ Ruim\n3️⃣ Regular\n4️⃣ Bom\n5️⃣ Excelente';

export function CSATAutoConfig() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [] } = useQuery({
    queryKey: ['whatsapp-connections-csat'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_connections').select('id, name, status');
      return data || [];
    },
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['csat-auto-config'],
    queryFn: async () => {
      const { data } = await supabase.from('csat_auto_config').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  // "Último envio": o convite de CSAT é a linha de `messages` cujo
  // `client_message_id` é o id do encerramento (contrato da Edge
  // `csat-auto-send`). Os encerramentos recentes dão os ids candidatos; entre
  // eles, a mensagem mais nova é a última pesquisa enfileirada.
  const { data: ultimoEnvio, isLoading: carregandoUltimoEnvio, isError: erroUltimoEnvio } = useQuery({
    queryKey: ['csat-ultimo-envio'],
    queryFn: async () => {
      const { data: encerramentos, error: erroEncerramentos } = await supabase
        .from('conversation_closures')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(25);
      if (erroEncerramentos) throw erroEncerramentos;
      const ids = (encerramentos ?? [])
        .map((encerramento) => encerramento.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) return null;
      const { data: convites, error: erroConvites } = await supabase
        .from('messages')
        .select('created_at')
        .in('client_message_id', ids)
        .order('created_at', { ascending: false })
        .limit(1);
      if (erroConvites) throw erroConvites;
      return convites?.[0]?.created_at ?? null;
    },
  });

  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? false);
  const [delayMinutes, setDelayMinutes] = useState(config?.delay_minutes ?? 5);
  const [template, setTemplate] = useState(config?.message_template ?? DEFAULT_MESSAGE_TEMPLATE);
  const [connectionId, setConnectionId] = useState(config?.whatsapp_connection_id ?? '');

  // R2-AUTH-045 (item 269): a configuração carregada tem de chegar ao formulário.
  // Antes isto era um inicializador de useState, que só roda na PRIMEIRA renderização
  // — quando a query ainda não voltou (`config` indefinido). O formulário ficava nos
  // padrões e o "Salvar" sobrescrevia a configuração salva. A sincronização acontece
  // quando a linha carregada muda de identidade (id + updated_at), para um refetch
  // com os mesmos dados não apagar edição ainda não salva.
  const configKey = config?.id ? `${config.id}:${config.updated_at ?? ''}` : null;
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!config || !configKey || syncedKeyRef.current === configKey) return;
    syncedKeyRef.current = configKey;
    setIsEnabled(config.is_enabled ?? false);
    setDelayMinutes(config.delay_minutes ?? 5);
    setTemplate(config.message_template ?? DEFAULT_MESSAGE_TEMPLATE);
    setConnectionId(config.whatsapp_connection_id ?? '');
  }, [config, configKey]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        is_enabled: isEnabled,
        delay_minutes: delayMinutes,
        message_template: template,
        whatsapp_connection_id: connectionId || null,
        updated_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await supabase.from('csat_auto_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('csat_auto_config').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csat-auto-config'] });
      toast({ title: 'Configuração CSAT salva!', description: 'A pesquisa é enviada quando o atendente encerra a conversa.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquareHeart className="w-5 h-5 text-primary" />
          CSAT Automático
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Envie a pesquisa de satisfação automaticamente quando o atendente encerra a conversa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Configuração
          </CardTitle>
          <CardDescription>
            A pesquisa sai por WhatsApp no encerramento da conversa: uma vez por conversa, e só
            se o contato não tiver consentimento revogado nem tiver recebido pesquisa nos últimos
            30 dias.
          </CardDescription>
          <p className="text-xs text-muted-foreground mt-2" data-testid="csat-ultimo-envio">
            {carregandoUltimoEnvio
              ? 'Verificando o último envio…'
              : erroUltimoEnvio
                ? 'Não foi possível verificar o último envio.'
                : ultimoEnvio
                  ? `Último envio: ${new Date(ultimoEnvio).toLocaleString('pt-BR')}`
                  : 'Nenhuma pesquisa enviada ainda.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar CSAT Automático</Label>
              <p className="text-xs text-muted-foreground">Enviar pesquisa ao encerrar a conversa</p>
            </div>
            <Switch aria-label="Ativar CSAT Automático" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Atraso após resolução (minutos)
            </Label>
            <Input
              aria-label="Atraso após resolução em minutos"
              type="number"
              min={0}
              max={1440}
              value={delayMinutes}
              onChange={e => setDelayMinutes(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              O envio automático é imediato: este atraso ainda não é aplicado.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Conexão WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger aria-label="Conexão WhatsApp">
                <SelectValue placeholder="Selecione a conexão" />
              </SelectTrigger>
              <SelectContent>
                {connections.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Modelo da Mensagem
            </Label>
            <Textarea
              aria-label="Modelo da mensagem de notificação"
              rows={5}
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="Use {name} para o nome do contato"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {'{name}'}, {'{agent}'}, {'{queue}'}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/50 border">
            <p className="text-xs font-medium mb-2">Pré-visualização:</p>
            <p className="text-sm whitespace-pre-wrap">
              {template.replace('{name}', 'João Silva').replace('{agent}', 'Maria').replace('{queue}', 'Suporte')}
            </p>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

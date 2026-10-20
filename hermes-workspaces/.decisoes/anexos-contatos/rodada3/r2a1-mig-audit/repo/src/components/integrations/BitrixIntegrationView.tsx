import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Users, Briefcase, Phone } from 'lucide-react';
import { useBitrixApi } from '@/hooks/integrations/useBitrixApi';

export function BitrixIntegrationView() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [domain, setDomain] = useState('');
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const { syncContactsFromBitrix, loading: syncLoading } = useBitrixApi();

  const handleTestConnection = async () => {
    if (!webhookUrl) {
      toast.error('Informe a URL do Webhook');
      return;
    }

    setTesting(true);
    setConnectionStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('bitrix-api', {
        body: { action: 'list', entityType: 'lead', filters: { LIMIT: 1 } }
      });

      if (error || data?.error) {
        setConnectionStatus('error');
        toast.error('Falha na conexão com Bitrix24');
      } else {
        setConnectionStatus('connected');
        toast.success('Conexão com Bitrix24 estabelecida!');
      }
    } catch {
      setConnectionStatus('error');
      toast.error('Erro ao testar conexão');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncContacts = async () => {
    const result = await syncContactsFromBitrix();
    if (!result) {
      toast.error('Erro ao sincronizar contatos');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          Bitrix24
          {connectionStatus === 'connected' && <Badge variant="default" className="bg-success">Conectado</Badge>}
          {connectionStatus === 'error' && <Badge variant="destructive">Erro</Badge>}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Integração com CRM Bitrix24 para sincronização de leads, contatos, negócios e telefonia.
        </p>
      </div>

      {/* Configuração */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Configuração do Webhook</CardTitle>
          <CardDescription className="text-xs">
            Configure a URL do webhook do Bitrix24. Acesse Bitrix24 → Aplicativos → Webhooks → Webhook de entrada para obter a URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL do Webhook</Label>
            <Input
              id="webhook-url"
              placeholder="https://seudominio.bitrix24.com.br/rest/1/xxxxxxxxxxxxxxx/"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain">Domínio Bitrix24</Label>
            <Input
              id="domain"
              placeholder="seudominio.bitrix24.com.br"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <Button onClick={handleTestConnection} disabled={testing || !webhookUrl}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Testar Conexão
          </Button>
        </CardContent>
      </Card>

      {/* Funcionalidades */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Funcionalidades Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Users className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">CRM</p>
                <p className="text-xs text-muted-foreground">Leads, contatos e negócios</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Phone className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Telefonia</p>
                <p className="text-xs text-muted-foreground">Registro e gravação de chamadas</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Briefcase className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Sincronização</p>
                <p className="text-xs text-muted-foreground">Sync bidirecional de dados</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações rápidas */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" onClick={handleSyncContacts} disabled={syncLoading}>
            {syncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar Contatos do Bitrix24
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

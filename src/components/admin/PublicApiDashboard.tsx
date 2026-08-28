import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('PublicApiDashboard');
import { Globe, Key, Copy, RefreshCw, Send, CheckCircle, XCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ApiLog {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
  entity_type: string | null;
}

export function PublicApiDashboard() {
  const [apiToken, setApiToken] = useState('');
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load API token from global_settings
      const { data: setting } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'api_token')
        .single();

      if (setting?.value) setApiToken(setting.value as string);

      // Load recent API usage logs from audit_logs
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, details, entity_type')
        .eq('entity_type', 'public_api')
        .order('created_at', { ascending: false })
        .limit(50);

      setLogs((auditLogs || []) as ApiLog[]);
    } catch (err) {
      log.warn('Failed to load API data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'zapp_';
    for (let i = 0; i < 40; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewToken(token);
  };

  const saveToken = async () => {
    if (!newToken) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('global_settings')
        .upsert({ key: 'api_token', value: newToken, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setApiToken(newToken);
      setNewToken('');
      toast.success('Token de API salvo com sucesso');
    } catch {
      toast.error('Erro ao salvar token');
    } finally {
      setSaving(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(apiToken || newToken);
    toast.success('Token copiado!');
  };

  const baseUrl = `${SUPABASE_URL}/functions/v1/public-api`;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">API Pública</h2>
          <p className="text-sm text-muted-foreground">Gerencie tokens e monitore o uso da API REST externa</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* API Token Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-5 h-5" /> Token de Autenticação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiToken && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Token Atual</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={showToken ? apiToken : '•'.repeat(30)} className="font-mono text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}>
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToken} aria-label="Copiar token">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Gere um novo token..."
              value={newToken}
              readOnly
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={generateToken} className="shrink-0">
              Gerar Token
            </Button>
            {newToken && (
              <Button size="sm" onClick={saveToken} disabled={saving} className="shrink-0">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Endpoint Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="w-5 h-5" /> Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs space-y-2 border">
            <p className="text-muted-foreground">POST {baseUrl}</p>
            <p className="text-muted-foreground">Headers:</p>
            <p className="pl-4">x-api-key: <span className="text-primary">{'<seu_token>'}</span></p>
            <p className="pl-4">Content-Type: application/json</p>
            <p className="text-muted-foreground mt-2">Body (enviar mensagem):</p>
            <pre className="pl-4 text-foreground/80">{`{
  "action": "send",
  "number": "5511999999999",
  "message": "Olá!",
  "connectionId": "(opcional)"
}`}</pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Ações suportadas: <Badge variant="secondary" className="text-[10px]">send</Badge>
          </p>
        </CardContent>
      </Card>

      {/* Usage Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-5 h-5" /> Logs de Uso
            <Badge variant="secondary" className="text-[10px] ml-auto">{logs.length} registros</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum log de uso registrado ainda. As requisições à API aparecerão aqui.
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  {log.action.includes('error') || log.action.includes('fail') ? (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {log.details && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {JSON.stringify(log.details).substring(0, 40)}...
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

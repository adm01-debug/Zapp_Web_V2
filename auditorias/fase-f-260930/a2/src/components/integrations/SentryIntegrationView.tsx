import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Bug, ShieldAlert, Activity, AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, Clock } from 'lucide-react';

interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  replaysSampleRate: number;
  enablePerformance: boolean;
  enableReplays: boolean;
}

interface MockError {
  id: string;
  title: string;
  level: 'error' | 'warning' | 'info';
  count: number;
  lastSeen: string;
  isResolved: boolean;
}

const mockErrors: MockError[] = [
  { id: '1', title: 'TypeError: Cannot read properties of undefined', level: 'error', count: 23, lastSeen: '2 min atrás', isResolved: false },
  { id: '2', title: 'NetworkError: Failed to fetch', level: 'error', count: 8, lastSeen: '15 min atrás', isResolved: false },
  { id: '3', title: 'Warning: Each child should have a unique key', level: 'warning', count: 45, lastSeen: '1h atrás', isResolved: false },
  { id: '4', title: 'RangeError: Maximum call stack exceeded', level: 'error', count: 2, lastSeen: '3h atrás', isResolved: true },
];

export function SentryIntegrationView() {
  const [isConnected, setIsConnected] = useState(false);
  const [config, setConfig] = useState<SentryConfig>({
    dsn: '',
    environment: 'production',
    tracesSampleRate: 0.1,
    replaysSampleRate: 0.1,
    enablePerformance: true,
    enableReplays: false,
  });
  const [errors, setErrors] = useState<MockError[]>(mockErrors);

  const handleConnect = () => {
    if (!config.dsn.trim()) {
      toast.error('Informe o DSN do Sentry');
      return;
    }
    setIsConnected(true);
    toast.success('Sentry conectado com sucesso!');
  };

  const resolveError = (id: string) => {
    setErrors(prev => prev.map(e => e.id === id ? { ...e, isResolved: true } : e));
    toast.success('Erro marcado como resolvido');
  };

  const levelColor = (level: string) => {
    if (level === 'error') return 'text-destructive';
    if (level === 'warning') return 'text-warning';
    return 'text-info';
  };

  const unresolvedCount = errors.filter(e => !e.isResolved).length;
  const totalEvents = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[hsl(255_35%_27%)]">
            <Bug className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Sentry Monitoring</h1>
            <p className="text-muted-foreground text-sm">Monitoramento de erros e performance</p>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'} className="ml-auto">
            {isConnected ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </motion.div>

      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Configuração</CardTitle>
          <CardDescription>DSN e opções do Sentry</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>DSN</Label>
            <Input placeholder="https://...@sentry.io/..." value={config.dsn} onChange={e => setConfig(p => ({ ...p, dsn: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Ambiente</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={config.environment} onChange={e => setConfig(p => ({ ...p, environment: e.target.value }))}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div>
              <Label>Traces Rate</Label>
              <Input type="number" step="0.01" min="0" max="1" value={config.tracesSampleRate} onChange={e => setConfig(p => ({ ...p, tracesSampleRate: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <Switch checked={config.enablePerformance} onCheckedChange={v => setConfig(p => ({ ...p, enablePerformance: v }))} />
              <Label className="text-xs">Performance</Label>
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <Switch checked={config.enableReplays} onCheckedChange={v => setConfig(p => ({ ...p, enableReplays: v }))} />
              <Label className="text-xs">Session Replay</Label>
            </div>
          </div>
          <Button onClick={handleConnect} style={{ background: 'var(--gradient-primary)' }}>
            {isConnected ? <RefreshCw className="w-4 h-4 mr-2" /> : <Bug className="w-4 h-4 mr-2" />}
            {isConnected ? 'Atualizar' : 'Ativar Monitoramento'}
          </Button>
        </CardContent>
      </Card>

      {isConnected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-secondary/30">
              <CardContent className="py-4 text-center">
                <ShieldAlert className="w-6 h-6 mx-auto mb-1 text-destructive" />
                <p className="text-2xl font-bold text-foreground">{unresolvedCount}</p>
                <p className="text-xs text-muted-foreground">Não resolvidos</p>
              </CardContent>
            </Card>
            <Card className="border-secondary/30">
              <CardContent className="py-4 text-center">
                <Activity className="w-6 h-6 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold text-foreground">{totalEvents}</p>
                <p className="text-xs text-muted-foreground">Eventos totais</p>
              </CardContent>
            </Card>
            <Card className="border-secondary/30">
              <CardContent className="py-4 text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-1 text-success" />
                <p className="text-2xl font-bold text-foreground">99.2%</p>
                <p className="text-xs text-muted-foreground">Crash-free</p>
              </CardContent>
            </Card>
          </div>

          {/* Error List */}
          <h2 className="font-semibold text-foreground">Issues Recentes</h2>
          <div className="space-y-2">
            {errors.map(err => (
              <Card key={err.id} className={`border-secondary/30 ${err.isResolved ? 'opacity-50' : ''}`}>
                <CardContent className="py-3 flex items-center gap-3">
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${levelColor(err.level)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{err.title}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{err.count}x</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {err.lastSeen}</span>
                    </div>
                  </div>
                  <Badge variant={err.level === 'error' ? 'destructive' : 'outline'} className="text-xs">{err.level}</Badge>
                  {!err.isResolved ? (
                    <Button size="sm" variant="ghost" onClick={() => resolveError(err.id)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs text-success">Resolvido</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

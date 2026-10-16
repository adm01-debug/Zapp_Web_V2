import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Bug, FlaskConical } from 'lucide-react';

interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  replaysSampleRate: number;
  enablePerformance: boolean;
  enableReplays: boolean;
}

export function SentryIntegrationView() {
  const [config, setConfig] = useState<SentryConfig>({
    dsn: '',
    environment: 'production',
    tracesSampleRate: 0.1,
    replaysSampleRate: 0.1,
    enablePerformance: true,
    enableReplays: false,
  });

  // R2-API-047: não existe integração real com o Sentry nesta versão — nenhum SDK é inicializado,
  // nenhum DSN é validado, nada é persistido e não há API de métricas consultada. Por isso a
  // ativação é recusada (a tela nunca assume o estado "Ativo") e esta tela não apresenta
  // estatísticas: números fixos de exemplo não podem aparecer como dados do ambiente.
  const handleConnect = () => {
    if (!config.dsn.trim()) {
      toast.error('Informe o DSN do Sentry');
      return;
    }
    toast.error('Integração real com o Sentry ainda não está disponível');
  };

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
          <Badge variant="warning" className="ml-auto">
            Demonstração
          </Badge>
        </div>
      </motion.div>

      <Alert className="border-warning/30 bg-warning/10">
        <FlaskConical className="h-4 w-4 !text-warning" />
        <AlertTitle className="text-warning">Funcionalidade em demonstração</AlertTitle>
        <AlertDescription>
          Esta tela mostra apenas como a configuração do Sentry seria preenchida — a integração real
          (SDK, validação do DSN e API de métricas) ainda não foi implementada. Nenhum DSN é enviado,
          nenhuma opção é salva e a ativação está bloqueada. Sem fonte real, esta tela também não exibe
          estatísticas de erros nem de crash-free.
        </AlertDescription>
      </Alert>

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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-auto inline-block" tabIndex={0} aria-disabled="true">
                  <Button onClick={handleConnect} disabled style={{ background: 'var(--gradient-primary)' }}>
                    <Bug className="w-4 h-4 mr-2" />
                    Ativar Monitoramento
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Integração real com Sentry ainda não está disponível — em desenvolvimento.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}

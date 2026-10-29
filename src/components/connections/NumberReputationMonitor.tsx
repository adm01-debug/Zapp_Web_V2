import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, TrendingUp, TrendingDown, AlertTriangle, Flame, Thermometer, BarChart3, Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useUserRole } from '@/hooks/system/useUserRole';

interface ReputationData {
  id: string;
  whatsapp_connection_id: string;
  health_score: number;
  messages_sent_today: number;
  failures_today: number;
  complaints_count: number;
  warmup_status: string;
  warmup_day: number | null;
  daily_limit: number | null;
}

interface ConnectionInfo {
  id: string;
  instance_id: string;
  phone_number: string | null;
}

export function NumberReputationMonitor() {
  const [reputations, setReputations] = useState<(ReputationData & { connection?: ConnectionInfo })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // A policy de UPDATE de number_reputation é só de admin/supervisor
  // (migration 20260409190343, "Admins can update reputation"). Sem a guarda,
  // o atendente clicava e a RLS devolvia 0 linhas sem erro.
  const { isAdmin, isSupervisor } = useUserRole();
  const canStartWarmup = isAdmin || isSupervisor;

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: reps, error: repsError } = await supabase
      .from('number_reputation')
      .select('*');

    const { data: connections, error: connectionsError } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, phone_number');

    // Falha de leitura não é "sem dados": o aviso de erro é outro.
    if (repsError || connectionsError) {
      setLoadError(true);
      setReputations([]);
      setLoading(false);
      return;
    }

    setLoadError(false);
    setReputations((reps ?? []).map(r => ({
      ...r,
      connection: (connections ?? []).find(c => c.id === r.whatsapp_connection_id) as ConnectionInfo | undefined,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    loadData();
  }, [loadData]);

  const startWarmup = async (id: string) => {
    // .select() para saber quantas linhas a RLS deixou gravar: 0 linhas sem
    // erro é o caso do atendente e não pode virar "Aquecimento iniciado".
    const { data, error } = await supabase.from('number_reputation').update({
      warmup_status: 'active',
      warmup_day: 1,
      daily_limit: 20,
    }).eq('id', id).select('id');

    if (error || !data || data.length === 0) {
      toast.error('Não foi possível iniciar o aquecimento');
      return;
    }

    toast.success('Aquecimento iniciado');
    loadData();
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getHealthBg = (score: number) => {
    if (score >= 80) return 'bg-success/10';
    if (score >= 50) return 'bg-warning/10';
    return 'bg-destructive/10';
  };

  const warmupLabels: Record<string, string> = {
    none: 'Sem aquecimento',
    active: 'Em aquecimento',
    completed: 'Aquecido',
    paused: 'Pausado',
  };

  // Sem nenhuma linha gravada (e sem gravador no sistema, nenhuma migration faz
  // INSERT em number_reputation) o cartão fica vazio para sempre — melhor não
  // existir na tela. O componente não é apagado: volta a aparecer quando houver
  // dado, e erro de leitura tem aviso próprio.
  if (!loading && !loadError && reputations.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Reputação de Números
          </h2>
          <p className="text-sm text-muted-foreground">Monitor de saúde e aquecimento de instâncias</p>
        </div>
      </div>

      <Alert className="border-warning/30 bg-warning/10">
        <Info className="h-4 w-4 !text-warning" />
        <AlertTitle className="text-warning">Configuração sem execução automática</AlertTitle>
        <AlertDescription>
          O aquecimento e o limite diário são apenas registrados em number_reputation. Ainda não há um
          motor de envio que aplique estas configurações automaticamente — nenhum contador é renovado, o
          dia de aquecimento não avança e nenhum envio é recusado por estourar o limite. Os valores
          abaixo mostram o que está configurado, não uma operação em andamento.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-muted/20 rounded-xl animate-pulse" />)}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
            <p className="text-sm text-destructive">Não foi possível carregar a reputação dos números.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reputations.map((rep, idx) => (
            <motion.div key={rep.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{rep.connection?.instance_id || 'Instância'}</p>
                      <p className="text-xs text-muted-foreground">{rep.connection?.phone_number || 'N/A'}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getHealthBg(rep.health_score)}`}>
                      <span className={`text-lg font-bold ${getHealthColor(rep.health_score)}`}>{rep.health_score}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-bold">{rep.messages_sent_today}</p>
                      <p className="text-3xs text-muted-foreground">Enviadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-destructive">{rep.failures_today}</p>
                      <p className="text-3xs text-muted-foreground">Falhas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-warning">{rep.complaints_count}</p>
                      <p className="text-3xs text-muted-foreground">Reclamações</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <div className="flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-muted-foreground" />
                      <Badge variant="outline" className="text-3xs">
                        {warmupLabels[rep.warmup_status] || rep.warmup_status}
                        {rep.warmup_day ? ` (Dia ${rep.warmup_day})` : ''}
                      </Badge>
                    </div>
                    {rep.warmup_status === 'none' && canStartWarmup && (
                      <Button variant="outline" size="sm" className="h-6 text-3xs" onClick={() => startWarmup(rep.id)}>
                        <Flame className="w-3 h-3 mr-1" />
                        Aquecer
                      </Button>
                    )}
                  </div>

                  {rep.daily_limit && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-3xs text-muted-foreground">
                        <span>Limite diário (configurado)</span>
                        <span>{rep.messages_sent_today}/{rep.daily_limit}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            rep.messages_sent_today / rep.daily_limit > 0.9 ? 'bg-destructive' :
                            rep.messages_sent_today / rep.daily_limit > 0.7 ? 'bg-warning' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, (rep.messages_sent_today / rep.daily_limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

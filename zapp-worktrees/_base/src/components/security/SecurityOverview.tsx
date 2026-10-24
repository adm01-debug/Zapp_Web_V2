import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { Shield, Smartphone, Key, AlertTriangle, CheckCircle2, XCircle, Monitor, Lock, MinusCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMfaFactors } from '@/hooks/auth/useMFA';
import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';
import { useUserRole } from '@/hooks/system/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { SecurityAlertsPanel, SecurityDevicesPanel } from './SecurityPanels';
import type { Device } from './SecurityPanels';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

// 'on'/'off' só depois de medir; 'loading'/'error'/'unmeasured' nunca viram pontuação.
type ItemStatus = 'on' | 'off' | 'loading' | 'error' | 'unmeasured';

interface SecurityItem {
  id: string;
  title: string;
  description: string;
  icon: typeof Key;
  status: ItemStatus;
  /** Pontos do item; null enquanto não houver medição válida. */
  score: number | null;
  /** Teto do item; null quando a tela não mede o item (não é pontuável). */
  maxScore: number | null;
}

const ITEM_BOX_CLASS: Record<ItemStatus, string> = {
  on: 'bg-success/10',
  off: 'bg-warning/10',
  loading: 'bg-muted',
  error: 'bg-destructive/10',
  unmeasured: 'bg-muted',
};

const ITEM_ICON_CLASS: Record<ItemStatus, string> = {
  on: 'text-success',
  off: 'text-warning',
  loading: 'text-muted-foreground',
  error: 'text-destructive',
  unmeasured: 'text-muted-foreground',
};

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'on':
      return <CheckCircle2 className="w-5 h-5 text-success" />;
    case 'off':
      return <XCircle className="w-5 h-5 text-warning" />;
    case 'loading':
      return <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-destructive" />;
    default:
      return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
  }
}

export function SecurityOverview() {
  const { user } = useAuth();
  // Fonte compartilhada e escopada pela sessão: carregando, erro e "nenhum fator"
  // são estados distintos (antes o overview tinha instância própria de useMFA que
  // nunca buscava os fatores e exibia 2FA desativado com TOTP verificado).
  const mfaQuery = useMfaFactors(!!user);
  const { devices, sessions, loading: devicesLoading } = useDeviceDetection();
  const { hasRole } = useUserRole();
  const isAdmin = hasRole('admin');

  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState(false);

  // Fetch security alerts
  useEffect(() => {
    async function fetchAlerts() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('security_alerts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setSecurityAlerts(data || []);
        setAlertsError(false);
      } catch (error) {
        // Falha de leitura não é ausência de incidentes: marca indisponibilidade
        // em vez de deixar a lista vazia passar por "conta sem atividades suspeitas".
        log.error('Error fetching alerts:', error);
        setSecurityAlerts([]);
        setAlertsError(true);
      } finally {
        setLoadingAlerts(false);
      }
    }

    void fetchAlerts();
  }, [user]);

  const factors = mfaQuery.data ?? [];
  // Sem sessão não há medição; carregando != "zero fatores".
  const mfaLoading = !user || mfaQuery.isLoading;
  const mfaError = !!user && mfaQuery.isError;
  const verifiedFactors = factors.filter(f => f.status === 'verified');
  const isMFAEnabled = verifiedFactors.length > 0;
  const trustedDevices = devices.filter(d => d.is_trusted).length;
  const unresolvedAlerts = securityAlerts.filter(a => !a.is_resolved).length;

  const securityItems: SecurityItem[] = [
    {
      id: 'mfa',
      title: 'Autenticação em Duas Etapas',
      description: mfaLoading
        ? 'Verificando os métodos configurados…'
        : mfaError
          ? 'Não foi possível verificar os fatores de MFA'
          : isMFAEnabled
            ? `${verifiedFactors.length} método(s) verificado(s)`
            : 'Nenhum método de dois fatores verificado',
      icon: Key,
      status: mfaLoading ? 'loading' : mfaError ? 'error' : isMFAEnabled ? 'on' : 'off',
      score: mfaLoading || mfaError ? null : isMFAEnabled ? 25 : 0,
      maxScore: 25,
    },
    {
      id: 'devices',
      title: 'Dispositivos Confiáveis',
      description: devicesLoading
        ? 'Verificando dispositivos…'
        : `${trustedDevices} de ${devices.length} dispositivos são confiáveis`,
      icon: Smartphone,
      status: devicesLoading ? 'loading' : trustedDevices > 0 ? 'on' : 'off',
      score: devicesLoading ? null : trustedDevices > 0 ? 25 : 15,
      maxScore: 25,
    },
    {
      id: 'sessions',
      title: 'Sessões Ativas',
      description: devicesLoading ? 'Verificando sessões…' : `${sessions.length} sessão(ões) ativa(s)`,
      icon: Monitor,
      status: devicesLoading ? 'loading' : sessions.length <= 3 ? 'on' : 'off',
      score: devicesLoading ? null : sessions.length <= 3 ? 25 : 15,
      maxScore: 25,
    },
    {
      id: 'password',
      title: 'Senha Forte',
      description: 'Não é medida por esta tela: depende do provedor de autenticação',
      icon: Lock,
      // Sem dado verificável de força de senha aqui: o item não pontua nem afirma nada.
      status: 'unmeasured',
      score: null,
      maxScore: null,
    },
  ];

  // Só os itens com teto entram na conta; item não medido nunca vira ponto.
  const scorableItems = securityItems.filter(i => i.maxScore !== null);
  const maxScore = scorableItems.reduce((sum, i) => sum + (i.maxScore ?? 0), 0);
  const measured = scorableItems.every(i => i.score !== null);
  const totalScore = measured ? scorableItems.reduce((sum, i) => sum + (i.score ?? 0), 0) : null;
  const scorePending = mfaLoading || devicesLoading;

  // A escala visual é do teto medido (maxScore), não de 100: 75/75 é 100%.
  const scorePct =
    totalScore === null || maxScore === 0 ? null : Math.round((totalScore / maxScore) * 100);

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return 'text-success';
    if (pct >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
      case 'critical':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium':
        return 'bg-warning/10 text-warning border-yellow-500/20';
      default:
        return 'bg-info/10 text-info border-info/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Score Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Pontuação de Segurança</h3>
                <p className="text-sm text-muted-foreground">
                  {totalScore === null
                    ? 'Só entra na conta o que esta tela consegue medir'
                    : `Baseada em ${scorableItems.length} itens medidos nesta tela`}
                </p>
              </div>
              <div className="text-right">
                <div
                  className={`text-4xl font-bold ${scorePct === null ? 'text-muted-foreground' : getScoreColor(scorePct)}`}
                  aria-label={totalScore === null ? 'Pontuação indisponível' : `Pontuação ${totalScore} de ${maxScore}`}
                >
                  {totalScore === null ? '—' : totalScore}
                </div>
                <div className="text-sm text-muted-foreground">de {maxScore}</div>
              </div>
            </div>
            <div className="mt-4">
              <Progress
                value={scorePct ?? 0}
                className="h-3"
              />
            </div>
            {totalScore === null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {scorePending
                  ? 'Medindo as configurações da conta…'
                  : 'Não foi possível medir os fatores de autenticação: pontuação indisponível.'}
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <Smartphone className="w-5 h-5 text-info" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{devicesLoading ? '—' : devices.length}</div>
                  <div className="text-xs text-muted-foreground">Dispositivos</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Monitor className="w-5 h-5 text-success" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{devicesLoading ? '—' : sessions.length}</div>
                  <div className="text-xs text-muted-foreground">Sessões Ativas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${mfaLoading ? 'bg-muted' : isMFAEnabled ? 'bg-success/10' : 'bg-warning/10'}`}>
                  <Key className={`w-5 h-5 ${mfaLoading ? 'text-muted-foreground' : isMFAEnabled ? 'text-success' : 'text-warning'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{mfaLoading || mfaError ? '—' : verifiedFactors.length}</div>
                  <div className="text-xs text-muted-foreground">Fatores MFA</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${loadingAlerts || alertsError ? 'bg-muted' : unresolvedAlerts > 0 ? 'bg-destructive/10' : 'bg-success/10'}`}>
                  <AlertTriangle className={`w-5 h-5 ${loadingAlerts || alertsError ? 'text-muted-foreground' : unresolvedAlerts > 0 ? 'text-destructive' : 'text-success'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {loadingAlerts || alertsError ? '—' : unresolvedAlerts}
                  </div>
                  <div className="text-xs text-muted-foreground">Alertas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Security Items */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Status de Segurança
            </CardTitle>
            <CardDescription>
              Revise e melhore a segurança da sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {securityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${ITEM_BOX_CLASS[item.status]}`}>
                      <Icon className={`w-5 h-5 ${ITEM_ICON_CLASS[item.status]}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        {item.maxScore === null
                          ? 'não medida'
                          : item.score === null
                            ? '—'
                            : `${item.score}/${item.maxScore}`}
                      </span>
                    </div>
                    <StatusIcon status={item.status} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      <SecurityAlertsPanel alerts={securityAlerts} loading={loadingAlerts} error={alertsError} />
      <SecurityDevicesPanel devices={devices as unknown as Device[]} loading={devicesLoading} />
    </div>
  );
}

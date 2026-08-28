import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { Shield, Smartphone, Key, AlertTriangle, CheckCircle2, XCircle, Monitor, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMFA } from '@/hooks/auth/useMFA';
import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';
import { useUserRole } from '@/hooks/system/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { SecurityAlertsPanel, SecurityDevicesPanel } from './SecurityPanels';

interface SecurityScore {
  total: number;
  mfa: number;
  devices: number;
  sessions: number;
  password: number;
}

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

export function SecurityOverview() {
  const { user } = useAuth();
  const { isMFAEnabled, factors } = useMFA();
  const { devices, sessions, loading: devicesLoading } = useDeviceDetection();
  const { hasRole } = useUserRole();
  const isAdmin = hasRole('admin');

  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

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
      } catch (error) {
        log.error('Error fetching alerts:', error);
      } finally {
        setLoadingAlerts(false);
      }
    }

    fetchAlerts();
  }, [user]);

  // Calculate security score
  const calculateScore = (): SecurityScore => {
    let mfaScore = isMFAEnabled ? 25 : 0;
    let deviceScore = devices.filter(d => d.is_trusted).length > 0 ? 25 : 15;
    let sessionScore = sessions.length <= 3 ? 25 : 15;
    let passwordScore = 25; // Assume good password for now

    return {
      total: mfaScore + deviceScore + sessionScore + passwordScore,
      mfa: mfaScore,
      devices: deviceScore,
      sessions: sessionScore,
      password: passwordScore,
    };
  };

  const score = calculateScore();

  const getScoreColor = (total: number) => {
    if (total >= 80) return 'text-success';
    if (total >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (total: number) => {
    if (total >= 80) return 'bg-success';
    if (total >= 60) return 'bg-warning';
    return 'bg-destructive';
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

  const securityItems = [
    {
      id: 'mfa',
      title: 'Autenticação em Duas Etapas',
      description: 'Adicione uma camada extra de segurança',
      icon: Key,
      enabled: isMFAEnabled,
      score: score.mfa,
      maxScore: 25,
    },
    {
      id: 'devices',
      title: 'Dispositivos Confiáveis',
      description: `${devices.filter(d => d.is_trusted).length} de ${devices.length} dispositivos são confiáveis`,
      icon: Smartphone,
      enabled: devices.filter(d => d.is_trusted).length > 0,
      score: score.devices,
      maxScore: 25,
    },
    {
      id: 'sessions',
      title: 'Sessões Ativas',
      description: `${sessions.length} sessão(ões) ativa(s)`,
      icon: Monitor,
      enabled: sessions.length <= 3,
      score: score.sessions,
      maxScore: 25,
    },
    {
      id: 'password',
      title: 'Senha Forte',
      description: 'Sua senha atende aos requisitos de segurança',
      icon: Lock,
      enabled: true,
      score: score.password,
      maxScore: 25,
    },
  ];

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
                  Baseado nas suas configurações atuais
                </p>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-bold ${getScoreColor(score.total)}`}>
                  {score.total}
                </div>
                <div className="text-sm text-muted-foreground">de 100</div>
              </div>
            </div>
            <div className="mt-4">
              <Progress 
                value={score.total} 
                className="h-3"
              />
            </div>
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
                  <div className="text-2xl font-bold">{devices.length}</div>
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
                  <div className="text-2xl font-bold">{sessions.length}</div>
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
                <div className={`p-2 rounded-lg ${isMFAEnabled ? 'bg-success/10' : 'bg-warning/10'}`}>
                  <Key className={`w-5 h-5 ${isMFAEnabled ? 'text-success' : 'text-warning'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{factors.length}</div>
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
                <div className={`p-2 rounded-lg ${securityAlerts.filter(a => !a.is_resolved).length > 0 ? 'bg-destructive/10' : 'bg-success/10'}`}>
                  <AlertTriangle className={`w-5 h-5 ${securityAlerts.filter(a => !a.is_resolved).length > 0 ? 'text-destructive' : 'text-success'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {securityAlerts.filter(a => !a.is_resolved).length}
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
                    <div className={`p-2 rounded-lg ${item.enabled ? 'bg-success/10' : 'bg-warning/10'}`}>
                      <Icon className={`w-5 h-5 ${item.enabled ? 'text-success' : 'text-warning'}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-medium">{item.score}/{item.maxScore}</span>
                    </div>
                    {item.enabled ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <XCircle className="w-5 h-5 text-warning" />
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      <SecurityAlertsPanel alerts={securityAlerts} loading={loadingAlerts} />
      <SecurityDevicesPanel devices={devices} loading={devicesLoading} />
    </div>
  );
}

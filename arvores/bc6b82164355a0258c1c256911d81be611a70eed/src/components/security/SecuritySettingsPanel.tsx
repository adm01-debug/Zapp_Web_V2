import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Key, 
  Smartphone, 
  Lock, 
  History, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MFASettings } from '@/components/mfa/MFASettings';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMFA } from '@/hooks/auth/useMFA';
import { useReauthentication } from '@/hooks/auth/useReauthentication';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { toast } from 'sonner';

interface SecuritySettingsPanelProps {
  onSwitchTab?: (tab: string) => void;
}

export function SecuritySettingsPanel({ onSwitchTab }: SecuritySettingsPanelProps) {
  const { user } = useAuth();
  const { isMFAEnabled, factors } = useMFA();
  const { 
    showReauthDialog, 
    pendingAction, 
    requireReauth, 
    confirmReauth, 
    cancelReauth, 
    getActionLabel,
    isReauthenticating 
  } = useReauthentication();
  
  const [showMFASettings, setShowMFASettings] = useState(false);

  const securityItems = [
    {
      icon: Smartphone,
      title: 'Autenticação em Dois Fatores (2FA)',
      description: isMFAEnabled 
        ? `${factors.filter(f => f.status === 'verified').length} método(s) configurado(s)` 
        : 'Adicione uma camada extra de proteção',
      status: isMFAEnabled ? 'enabled' : 'disabled',
      action: () => {
        requireReauth('configure_mfa', async () => {
          setShowMFASettings(true);
        });
      },
    },
    {
      icon: Key,
      title: 'Alterar Senha',
      description: 'Atualize sua senha regularmente para maior segurança',
      status: 'action',
      action: () => {
        requireReauth('change_password', async () => {
          window.location.href = '/reset-password';
        });
      },
    },
    {
      icon: History,
      title: 'Sessões Ativas',
      description: 'Gerencie dispositivos conectados à sua conta',
      status: 'info',
      action: () => {
        if (onSwitchTab) {
          onSwitchTab('devices');
        }
      },
    },
    {
      icon: AlertTriangle,
      title: 'Alertas de Segurança',
      description: 'Receba notificações sobre atividades suspeitas',
      status: 'enabled',
      action: () => {
        if (onSwitchTab) {
          onSwitchTab('notifications');
        }
      },
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Ativo
          </Badge>
        );
      case 'disabled':
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            <XCircle className="w-3 h-3 mr-1" />
            Desativado
          </Badge>
        );
      default:
        return null;
    }
  };

  if (showMFASettings) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setShowMFASettings(false)}>
          ← Voltar
        </Button>
        <MFASettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Segurança da Conta</CardTitle>
              <CardDescription>
                Gerencie suas configurações de segurança e autenticação
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Security Score */}
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Nível de Segurança</span>
              <Badge variant={isMFAEnabled ? 'default' : 'secondary'}>
                {isMFAEnabled ? 'Alto' : 'Médio'}
              </Badge>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: isMFAEnabled ? '100%' : '60%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${isMFAEnabled ? 'bg-success' : 'bg-warning'}`}
              />
            </div>
            {!isMFAEnabled && (
              <p className="text-xs text-muted-foreground mt-2">
                Ative o 2FA para aumentar a segurança da sua conta
              </p>
            )}
          </div>

          <Separator />

          {/* Security Items */}
          <div className="space-y-2">
            {securityItems.map((item, index) => (
              <motion.button
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={item.action}
                className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors text-left group"
              >
                <div className="p-2 rounded-lg bg-muted">
                  <item.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {getStatusBadge(item.status)}
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Informações da Conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Último login</span>
            <span className="text-sm font-medium">
              {user?.last_sign_in_at 
                ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Conta criada em</span>
            <span className="text-sm font-medium">
              {user?.created_at 
                ? new Date(user.created_at).toLocaleDateString('pt-BR')
                : 'N/A'}
            </span>
          </div>
        </CardContent>
      </Card>

      <ReauthDialog
        open={showReauthDialog}
        onOpenChange={() => cancelReauth()}
        actionLabel={pendingAction ? getActionLabel(pendingAction) : ''}
        onConfirm={confirmReauth}
        onCancel={cancelReauth}
        isLoading={isReauthenticating}
      />
    </div>
  );
}

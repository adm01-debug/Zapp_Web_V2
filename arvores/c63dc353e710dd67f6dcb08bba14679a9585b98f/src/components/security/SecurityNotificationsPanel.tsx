import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, Shield, Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { useSecurityPushNotifications } from '@/hooks/system/useSecurityPushNotifications';

export function SecurityNotificationsPanel() {
  const {
    isEnabled,
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    requestPermission,
    toggleSubscription,
    showNotification,
  } = usePushNotifications();

  const { isEnabled: securityNotificationsEnabled } = useSecurityPushNotifications();
  const [testSending, setTestSending] = useState(false);

  const handleToggle = async () => {
    await toggleSubscription();
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      await showNotification({
        title: '🔐 Teste de Alerta de Segurança',
        body: 'Esta é uma notificação de teste do sistema de segurança.',
        tag: 'test-security-' + Date.now(),
        data: {
          category: 'security',
          test: true,
        },
      });
    } finally {
      setTestSending(false);
    }
  };

  if (!isEnabled) {
    return (
      <Card className="border-muted bg-card">
        <CardContent className="flex items-start gap-4 p-4">
          <BellOff className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="font-medium">Notificações Push Indisponíveis</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Os alertas push estão temporariamente desativados nesta versão.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card className="border-yellow-500/20 bg-warning/5">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
          <div>
            <h4 className="font-medium">Notificações Push Não Suportadas</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Seu navegador não suporta notificações push. Tente usar Chrome, Firefox, Edge ou Safari.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notificações Push de Segurança
        </CardTitle>
        <CardDescription>
          Receba alertas de segurança em tempo real no seu navegador
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-lg ${isSubscribed ? 'bg-success/10' : 'bg-muted'}`}>
              {isSubscribed ? (
                <Bell className="w-5 h-5 text-success" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h4 className="font-medium">Status das Notificações</h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge 
                  variant="outline" 
                  className={
                    permission === 'granted' 
                      ? 'bg-success/10 text-success border-success/20'
                      : permission === 'denied'
                        ? 'bg-destructive/10 text-destructive border-destructive/20'
                        : 'bg-warning/10 text-warning border-yellow-500/20'
                  }
                >
                  {permission === 'granted' ? 'Permitido' : permission === 'denied' ? 'Bloqueado' : 'Não solicitado'}
                </Badge>
                {isSubscribed && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={isLoading || permission === 'denied'}
          />
        </div>

        {/* Permission denied message */}
        {permission === 'denied' && (
          <div className="flex items-start gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <h4 className="font-medium text-destructive">Permissão Negada</h4>
              <p className="text-sm text-muted-foreground mt-1">
                As notificações foram bloqueadas. Para ativá-las, clique no ícone de cadeado 
                na barra de endereço e permita notificações para este site.
              </p>
            </div>
          </div>
        )}

        {/* Security alerts info */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Tipos de alertas que você receberá:</Label>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Shield className="w-4 h-4 text-destructive" />
              <div>
                <span className="text-sm font-medium">Novo dispositivo detectado</span>
                <p className="text-xs text-muted-foreground">
                  Quando alguém fizer login de um dispositivo desconhecido
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <div>
                <span className="text-sm font-medium">Tentativas de login suspeitas</span>
                <p className="text-xs text-muted-foreground">
                  Múltiplas tentativas de login falhadas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Smartphone className="w-4 h-4 text-info" />
              <div>
                <span className="text-sm font-medium">Alterações de segurança</span>
                <p className="text-xs text-muted-foreground">
                  Alterações de senha, MFA ou configurações de segurança
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Test button */}
        {isSubscribed && (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleTestNotification}
            disabled={testSending}
          >
            {testSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Enviando...
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-2" />
                Testar Notificação
              </>
            )}
          </Button>
        )}

        {/* Info */}
        <div className="flex items-start gap-4 p-4 rounded-lg border bg-info/5 border-info/20">
          <Shield className="w-5 h-5 text-info mt-0.5" />
          <div>
            <h4 className="font-medium text-info">Por que ativar?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Receba alertas instantâneos sobre atividades suspeitas na sua conta, 
              mesmo quando não estiver usando o aplicativo. Isso permite uma resposta 
              rápida a possíveis ameaças de segurança.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

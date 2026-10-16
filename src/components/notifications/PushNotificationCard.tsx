import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, AlertTriangle, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PushNotificationCard() {
  const {
    isEnabled,
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    toggleSubscription,
    showNotification,
  } = usePushNotifications();
  const [testSending, setTestSending] = useState(false);

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      await showNotification({
        title: '🔔 Teste de Push',
        body: 'Esta é uma notificação push de teste.',
        tag: 'test-push-' + Date.now(),
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
              Este recurso está temporariamente desativado nesta versão.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card className="border-warning/20 bg-card">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
          <div>
            <h4 className="font-medium">Push Não Suportado</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Seu navegador não suporta notificações push.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isSubscribed ? "bg-primary/15" : "bg-muted"
            )}>
              {isSubscribed ? (
                <Smartphone className="w-5 h-5 text-primary" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Notificações Push</CardTitle>
              <CardDescription>
                Receba alertas mesmo com o navegador minimizado
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={() => toggleSubscription()}
            disabled={isLoading || permission === 'denied'}
          />
        </div>
      </CardHeader>
      {permission === 'denied' && (
        <CardContent>
          <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Permissão bloqueada. Ative nas configurações do navegador.
            </p>
          </div>
        </CardContent>
      )}
      {isSubscribed && (
        <CardContent>
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
                Testar Notificação Push
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

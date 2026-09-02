import { Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGmail } from '@/hooks/integrations/useGmail';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, RefreshCw } from 'lucide-react';

export function GmailIntegrationCard() {
  const { activeAccount, disconnectGmail, syncInbox, connectGmail } = useGmail();

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Gmail</CardTitle>
              <CardDescription className="text-xs">
                {activeAccount?.email_address || 'Nao conectado'}
              </CardDescription>
            </div>
          </div>
          <Badge variant={activeAccount ? 'default' : 'secondary'}>
            {activeAccount ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
      </CardHeader>
      {activeAccount && (
        <CardContent className="space-y-1 text-xs text-muted-foreground pb-2">
          {/* E46: exibir sync_status e last_error */}
          <div>Status: <span className="font-medium">{activeAccount.sync_status}</span></div>
          <div>Ultimo sync: {activeAccount.last_sync_at ? format(new Date(activeAccount.last_sync_at), 'dd/MM HH:mm', { locale: ptBR }) : '—'}</div>
          {activeAccount.last_error && (
            <div className="text-destructive mt-1 p-2 bg-destructive/10 rounded text-xs">
              Erro: {activeAccount.last_error}
            </div>
          )}
        </CardContent>
      )}
      <CardFooter className="gap-2 pt-0">
        {activeAccount ? (
          <>
            <Button size="sm" variant="outline" disabled={syncInbox.isPending} onClick={() => syncInbox.mutate({})}>
              {/* E47: spinner durante sync */}
              {syncInbox.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Sincronizar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => disconnectGmail.mutate(activeAccount.id)}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending}>
            {connectGmail.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Conectar Gmail
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

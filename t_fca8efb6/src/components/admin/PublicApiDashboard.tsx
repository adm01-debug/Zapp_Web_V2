import { ShieldOff } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PublicApiDashboard() {
  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-destructive/10 p-2">
          <ShieldOff className="h-5 w-5 text-destructive" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold">API Pública</h2>
          <p className="text-sm text-muted-foreground">Integração externa indisponível</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integração suspensa por segurança</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" role="status" aria-live="polite">
            <ShieldOff className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>API pública temporariamente desativada</AlertTitle>
            <AlertDescription>
              O endpoint legado foi bloqueado enquanto a autenticação é substituída por
              credenciais server-side hashadas, com escopo por empresa, rotação e auditoria.
              Tokens antigos não devem ser reutilizados.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

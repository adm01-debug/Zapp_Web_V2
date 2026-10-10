/**
 * AutoExportManager - BLOQUEADO por política de segurança.
 */

import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';

export function AutoExportManager() {
  return (
    <div className="space-y-6 w-full min-w-0">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          Exportação Automática — Bloqueada
        </h3>
        <p className="text-sm text-muted-foreground">
          A exportação automática de dados está desabilitada por política de segurança para proteção dos dados de clientes e fornecedores.
        </p>
      </div>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldAlert className="w-12 h-12 text-destructive/50 mb-3" />
          <p className="text-sm font-medium text-foreground">Funcionalidade Desabilitada</p>
          <p className="text-xs text-muted-foreground mt-1">
            A criação e envio automático de relatórios está bloqueada por política de proteção de dados (LGPD).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

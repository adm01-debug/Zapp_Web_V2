import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/system/useUserRole';

interface SyncCredentialActionProps {
  syncing: boolean;
  onSync: () => void;
}

/**
 * 13/11 — "o sistema deve buscar a chave sozinho". Aparece no diálogo de QR
 * quando a Edge responde que a credencial da instância foi recusada/não existe
 * (`instance_token_invalid` / `instance_token_missing`). Regra do dono
 * (docs/contexto/regras/manual/regras.md:17/:58): só o ADMIN gerencia conexões
 * e credenciais — a Edge exige `has_role(admin)`; supervisor e atendente só
 * recebem a orientação.
 *
 * Componente próprio (e não dentro do ConnectionsView) para que o papel só
 * seja consultado quando esse erro acontece.
 */
export function SyncCredentialAction({ syncing, onSync }: SyncCredentialActionProps) {
  const { isAdmin, loading } = useUserRole();
  if (loading) return null;
  if (!isAdmin) {
    return (
      <p className="text-xs text-muted-foreground">
        Peça a um administrador para sincronizar a credencial desta conexão.
      </p>
    );
  }
  return (
    <Button onClick={onSync} disabled={syncing} className="mr-2">
      {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
      Sincronizar credencial
    </Button>
  );
}

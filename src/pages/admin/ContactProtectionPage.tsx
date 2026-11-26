import { ShieldCheck } from 'lucide-react';
import { ContactProtectionPolicyPanel } from '@/components/security/ContactProtectionPolicyPanel';
import { useUserRole } from '@/hooks/system/useUserRole';

/**
 * Política de proteção de contatos (CT-091).
 *
 * Só admin lê e altera as regras (RLS `has_role(auth.uid(),'admin')` nas quatro operações); os
 * demais papéis leem a política efetiva pela RPC `get_my_protection_policy`.
 */
export default function ContactProtectionPage() {
  const { isAdmin, loading } = useUserRole();

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Proteção de contatos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mascaramento, bloqueio de cópia, bloqueio de impressão, marca d'água e limite de fichas por
          hora — padrão do sistema e exceção por papel.
        </p>
      </header>

      {loading ? null : isAdmin ? (
        <ContactProtectionPolicyPanel />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="protecao-sem-acesso">
          Estas regras só podem ser vistas e alteradas por administradores.
        </p>
      )}
    </div>
  );
}

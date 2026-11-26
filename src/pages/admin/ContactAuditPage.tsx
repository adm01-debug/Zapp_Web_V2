import { ShieldCheck } from 'lucide-react';
import { ContactAuditTrailPanel } from '@/components/security/ContactAuditTrailPanel';
import { useUserRole } from '@/hooks/system/useUserRole';

/**
 * Trilha de contatos (exclusões, restaurações, bloqueios e desbloqueios).
 *
 * Primeira tela das tabelas `contact_deletion_audit` e `contact_block_audit`: os triggers gravavam
 * autor e momento e a informação ficava invisível. Só admin/supervisão — é o mesmo portão da RLS
 * das duas tabelas.
 */
export default function ContactAuditPage() {
  const { isSupervisor } = useUserRole();

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Auditoria de contatos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exclusões, restaurações, bloqueios e desbloqueios de contato com autor e momento, direto
          das trilhas de auditoria do banco.
        </p>
      </header>

      {isSupervisor ? (
        <ContactAuditTrailPanel />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="trilha-sem-acesso">
          Esta trilha é restrita a admin e supervisão.
        </p>
      )}
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import type { AppRole } from '@/services/role.service';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agente',
  special_agent: 'Agente+',
};

const ROLE_VARIANTS: Record<AppRole, 'default' | 'secondary' | 'outline' | 'success'> = {
  admin: 'default',
  supervisor: 'secondary',
  agent: 'outline',
  special_agent: 'success',
};

export function RoleBadge({ role, className }: { role: AppRole; className?: string }) {
  return (
    <Badge variant={ROLE_VARIANTS[role]} className={className}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

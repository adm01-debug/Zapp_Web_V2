import { SLARuleScope } from '@/hooks/sla/useSLARules';
import { User, Building2, Briefcase, Tag, LayoutGrid, UserCog } from 'lucide-react';

export const SCOPE_TABS: { value: SLARuleScope; label: string; icon: React.ElementType }[] = [
  { value: 'contact', label: 'Por Cliente', icon: User },
  { value: 'company', label: 'Por Empresa', icon: Building2 },
  { value: 'job_title', label: 'Por Cargo', icon: Briefcase },
  { value: 'contact_type', label: 'Por Tipo', icon: Tag },
  { value: 'queue', label: 'Por Fila', icon: LayoutGrid },
  { value: 'agent', label: 'Por Agente', icon: UserCog },
];

export const CONTACT_TYPES = ['cliente', 'lead', 'fornecedor', 'parceiro', 'vip'] as const;

export const SCOPE_LABELS: Record<SLARuleScope, string> = {
  contact: 'Cliente',
  company: 'Empresa',
  job_title: 'Cargo',
  contact_type: 'Tipo de Contato',
  queue: 'Fila',
  agent: 'Agente',
};

export function formatSLAMinutes(m: number): string {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

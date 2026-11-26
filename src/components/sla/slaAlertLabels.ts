import type { SlaAlertEvent } from '@/hooks/sla/useSlaAlertEvents';

/**
 * Nome do contato no alerta. Sem nome visível (RLS ou cadastro sem nome) cai no telefone e, por fim,
 * no id curto — nunca em um texto genérico que esconda de quem é o alerta.
 */
export function slaAlertContactLabel(alerta: SlaAlertEvent): string {
  if (alerta.contactName) return alerta.contactName;
  if (alerta.contactPhone) return alerta.contactPhone;
  return `Contato ${alerta.contactId.slice(0, 8)}`;
}

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ContactAuditEvent } from '@/hooks/security/useContactAuditTrail';

/**
 * Rótulos da trilha de contatos. Ficam fora do componente para o arquivo da tela exportar só
 * componente (`react-refresh/only-export-components`).
 */

/** Id curto: o banco guarda o uuid, mas a tela não pode vazar 36 caracteres por linha. */
export function shortId(valor: string | null | undefined): string {
  return valor ? valor.slice(0, 8) : '—';
}

export function contactAuditContactLabel(evento: ContactAuditEvent): string {
  const contato = evento.contact;
  if (contato?.name) return contato.name;
  if (contato?.phone) return contato.phone;
  return `Contato ${shortId(evento.contactId)}`;
}

/**
 * Quem executou. O trigger grava o uuid do auth e o id do perfil; quando o perfil já não existe
 * (execução de serviço, conta removida) o nome não existe em lugar nenhum — mostrar o papel do
 * banco é a informação verdadeira, não um "sistema" inventado.
 */
export function contactAuditAuthorLabel(evento: ContactAuditEvent): string {
  if (evento.authorName) return evento.authorName;
  const papel = evento.performedByDbRole || 'sem papel';
  return `${papel} · ${shortId(evento.performedBy ?? evento.performedByProfile)}`;
}

/** Momento do marcador (`null` = "não estava marcado", que é o estado de antes da exclusão). */
export function contactAuditMarkerLabel(iso: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function contactAuditMarkerTransition(evento: ContactAuditEvent): string {
  return `${contactAuditMarkerLabel(evento.markerFrom)} → ${contactAuditMarkerLabel(evento.markerTo)}`;
}

import type { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';

/**
 * A4-D (auditoria adversarial, onda 2) — o editor de contato abria com `#address`, `#city` e
 * `#postal_code` VAZIOS, e o `Salvar` gravava esse vazio por cima do endereço real (mesma classe
 * de perda de dados do C1/F1).
 *
 * Eram dois defeitos somados:
 *  1. `ContactService.fetchEnrichedData` não pedia nenhuma coluna de endereço (corrigido lá);
 *  2. este literal — duplicado em `ContactDetails` e em `Crm360Tab` — só repassava 10 campos, e
 *     nem os dois iguais entre si (um lia `enrichedData.nickname`, o outro `contact.nickname`).
 *     Sem repassar, o dado nem chega ao formulário.
 *
 * Extraído para que o segundo defeito tenha teste: o que não é montado em função própria não tem
 * como ser provado por unidade, e a divergência entre os dois chamadores já era visível.
 */
export interface EditContactShapeSource {
  id: string;
  name: string;
  phone: string;
  avatar?: string | null;
  email?: string | null;
  nickname?: string | null;
  surname?: string | null;
  job_title?: string | null;
  company?: string | null;
  contact_type?: string | null;
  address?: string | null;
  address_number?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  postal_code?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function buildEditContactShape({
  contact,
  enrichedData,
}: {
  contact: EditContactShapeSource;
  // Partial de propósito: o helper só lê campo a campo com `?.` e nunca exige o objeto completo —
  // assim um fixture de teste não precisa inventar 8 campos que não interessam ao caso.
  enrichedData?: Partial<EnrichedContactData> | null;
}) {
  // O dado enriquecido (query própria) manda; o que vier no contato da conversa é rede de segurança.
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    avatar: contact.avatar ?? undefined,
    email: contact.email ?? undefined,
    nickname: enrichedData?.nickname ?? contact.nickname ?? undefined,
    surname: enrichedData?.surname ?? contact.surname ?? undefined,
    job_title: enrichedData?.job_title ?? contact.job_title ?? undefined,
    company: enrichedData?.company ?? contact.company ?? undefined,
    contact_type: enrichedData?.contact_type ?? contact.contact_type ?? undefined,
    address: enrichedData?.address ?? contact.address ?? undefined,
    address_number: enrichedData?.address_number ?? contact.address_number ?? undefined,
    city: enrichedData?.city ?? contact.city ?? undefined,
    neighborhood: enrichedData?.neighborhood ?? contact.neighborhood ?? undefined,
    postal_code: enrichedData?.postal_code ?? contact.postal_code ?? undefined,
    state: enrichedData?.state ?? contact.state ?? undefined,
    // Item 5 (onda 2): a coordenada sai daqui também. Sem ela o `EditContactDialog` abria com
    // lat/lng vazios (o form até os aceita, mas nunca os recebia) e não exibia o pino atual.
    latitude: enrichedData?.latitude ?? contact.latitude ?? undefined,
    longitude: enrichedData?.longitude ?? contact.longitude ?? undefined,
  };
}

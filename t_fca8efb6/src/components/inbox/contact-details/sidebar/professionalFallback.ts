export interface ProfessionalFallbackData {
  whatsapp: string | null;
  email: string | null;
  empresa: string | null;
  departamento: string | null;
  cargo: string | null;
}

interface FallbackContact {
  phone: string | null | undefined;
  email?: string | null;
}

interface FallbackEnriched {
  company?: string | null;
  job_title?: string | null;
}

/**
 * Fallback local do Zapp para a seção Dados Profissionais, usado quando a RPC
 * do Singu não encontra o contato (`status: 'not_found'`) ou a integração
 * está desligada. Nenhum valor é inventado — departamento não existe no
 * modelo local e fica null ("—" na UI).
 */
export function buildProfessionalFallback(
  contact: FallbackContact,
  enrichedData?: FallbackEnriched | null,
): ProfessionalFallbackData {
  return {
    whatsapp: contact.phone ?? null,
    email: contact.email ?? null,
    empresa: enrichedData?.company ?? null,
    cargo: enrichedData?.job_title ?? null,
    departamento: null,
  };
}

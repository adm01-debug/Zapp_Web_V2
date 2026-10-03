export type EmailCompanyRelationship = 'cliente' | 'fornecedor' | 'transportadora';

export interface EmailCompanySocial {
  platform: 'linkedin' | 'instagram';
  url: string;
}

export interface EmailCompanyContext {
  id: string;
  name: string;
  legalName: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: string | null;
  location: string | null;
  about: string | null;
  relationships: EmailCompanyRelationship[];
  relationshipsKnown: boolean;
  socials: EmailCompanySocial[];
  socialsKnown: boolean;
  aboutKnown: boolean;
  updatedAt: string | null;
}

export interface EmailContactContext {
  status: 'available' | 'not_linked' | 'ambiguous';
  company: EmailCompanyContext | null;
  source: {
    linked: boolean;
    consultedAt: string;
    resolution: 'stable_link' | 'phone' | 'email_exact' | 'none';
    participantEmail: string | null;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Runtime guard for the Edge boundary; TypeScript casts alone do not make a CRM response safe. */
export function isEmailContactContext(value: unknown): value is EmailContactContext {
  const context = record(value);
  const source = record(context?.source);
  if (!context || !['available', 'not_linked', 'ambiguous'].includes(String(context.status)) || !source ||
    typeof source.linked !== 'boolean' || typeof source.consultedAt !== 'string' ||
    !['stable_link', 'phone', 'email_exact', 'none'].includes(String(source.resolution)) ||
    !(typeof source.participantEmail === 'string' || source.participantEmail === null)) return false;
  if (context.status !== 'available') return context.company === null;
  const company = record(context.company);
  return Boolean(company && typeof company.id === 'string' && typeof company.name === 'string' &&
    (typeof company.website === 'string' || company.website === null) &&
    (typeof company.logoUrl === 'string' || company.logoUrl === null) &&
    Array.isArray(company.relationships) && Array.isArray(company.socials));
}

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

/** A deliberate choice returned only when an exact email has more than one CRM contact. */
export interface EmailCompanyCandidate {
  externalContactId: string;
  companyId: string | null;
  companyName: string | null;
}

export interface EmailContactContext {
  status: 'available' | 'not_linked' | 'ambiguous';
  company: EmailCompanyContext | null;
  /** Present only for `ambiguous`; callers must never invent a company from a domain. */
  candidates?: EmailCompanyCandidate[];
  source: {
    linked: boolean;
    consultedAt: string;
    resolution: 'stable_link' | 'phone' | 'email_exact' | 'none';
    participantEmail: string | null;
    selectedExternalContactId?: string | null;
    canLink?: boolean;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableString(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

function isCompany(value: unknown): value is EmailCompanyContext {
  const company = record(value);
  return Boolean(company && typeof company.id === 'string' && typeof company.name === 'string' &&
    nullableString(company.legalName) && nullableString(company.website) && nullableString(company.logoUrl) &&
    nullableString(company.industry) && nullableString(company.location) && nullableString(company.about) &&
    typeof company.relationshipsKnown === 'boolean' && typeof company.socialsKnown === 'boolean' &&
    typeof company.aboutKnown === 'boolean' && nullableString(company.updatedAt) &&
    Array.isArray(company.relationships) && company.relationships.every(item =>
      item === 'cliente' || item === 'fornecedor' || item === 'transportadora') &&
    Array.isArray(company.socials) && company.socials.every(item => {
      const social = record(item);
      return Boolean(social && (social.platform === 'linkedin' || social.platform === 'instagram') && typeof social.url === 'string');
    }));
}

function isCandidate(value: unknown): value is EmailCompanyCandidate {
  const candidate = record(value);
  return Boolean(candidate && typeof candidate.externalContactId === 'string' &&
    nullableString(candidate.companyId) && nullableString(candidate.companyName));
}

/** Runtime guard for the Edge boundary; TypeScript casts alone do not make a CRM response safe. */
export function isEmailContactContext(value: unknown): value is EmailContactContext {
  const context = record(value);
  const source = record(context?.source);
  if (!context || !['available', 'not_linked', 'ambiguous'].includes(String(context.status)) || !source ||
    typeof source.linked !== 'boolean' || typeof source.consultedAt !== 'string' ||
    !['stable_link', 'phone', 'email_exact', 'none'].includes(String(source.resolution)) ||
    !nullableString(source.participantEmail) ||
    !(source.selectedExternalContactId === undefined || nullableString(source.selectedExternalContactId)) ||
    !(typeof source.canLink === 'boolean' || source.canLink === undefined)) return false;
  if (context.status === 'available') return isCompany(context.company) && context.candidates === undefined;
  if (context.status === 'ambiguous') return context.company === null && Array.isArray(context.candidates) &&
    context.candidates.length > 1 && context.candidates.length <= 3 && context.candidates.every(isCandidate);
  return context.company === null && context.candidates === undefined;
}

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
  status: 'available' | 'not_linked';
  company: EmailCompanyContext | null;
  source: {
    linked: boolean;
    consultedAt: string;
  };
}

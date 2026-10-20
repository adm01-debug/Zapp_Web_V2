/**
 * Types for the get_contact_360_by_phone RPC response
 * from the external CRM database (bancodadosclientes)
 */

export interface Contact360Phone {
  numero: string;
  numero_e164: string | null;
  phone_type: string;
  is_whatsapp: boolean;
  is_primary?: boolean;
  departamento?: string | null;
}

export interface Contact360Email {
  email: string;
  email_type: string;
  is_primary?: boolean;
  departamento?: string | null;
}

export interface Contact360Social {
  plataforma: string;
  handle: string | null;
  url: string | null;
  nome_perfil?: string | null;
  seguidores?: number | null;
}

export interface Contact360Interaction {
  id: string;
  channel: string;
  direction: string;
  assunto: string | null;
  resumo: string | null;
  sentiment: string | null;
  data_interacao: string;
  type: string | null;
}

export interface Contact360Behavior {
  discProfile: string | null;
  discConfidence: number;
  vakProfile: {
    primary: string | null;
    scores: Record<string, number>;
  };
  preferredChannel: string;
  decisionPower: number;
  supportLevel: number;
  formalityLevel: number;
  currentChallenges: string[];
  competitorsUsed: string[];
  temperamentProfile: { primary: string | null };
}

export interface Contact360Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  nome_tratamento: string | null;
  apelido: string | null;
  cargo: string | null;
  departamento: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  relationship_stage: string | null;
  relationship_score: number;
  sentiment: string | null;
  tags: string[];
  behavior: Contact360Behavior | null;
  notes: string | null;
  source: string | null;
  assinatura_contato: string | null;
  bitrix_contact_id: number | null;
  created_at: string;
}

export interface Contact360Company {
  id: string;
  nome_crm: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  website: string | null;
  ramo_atividade: string | null;
  status: string | null;
  logo_url: string | null;
  cores_marca: string[] | null;
  nicho_cliente: string | null;
  porte_rf: string | null;
  natureza_juridica_desc: string | null;
  capital_social: number | null;
  data_fundacao: string | null;
  bitrix_company_id: number | null;
}

export interface Contact360Customer {
  vendedor_nome: string | null;
  sdr_nome: string | null;
  cliente_ativado: boolean;
  ja_comprou: boolean;
  data_primeira_compra: string | null;
  data_ultima_compra: string | null;
  total_pedidos: number;
  valor_total_compras: number;
  ticket_medio: number | null;
  poder_compra: string | null;
  perfil_preco: string | null;
  perfil_qualidade: string | null;
  perfil_prazo: string | null;
  grupo_clientes: string | null;
  ramo_atividade: string | null;
  data_ativacao: string | null;
  motivo_inativacao: string | null;
}

export interface Contact360RFM {
  recency_score: number | null;
  frequency_score: number | null;
  monetary_score: number | null;
  combined_score: number | null;
  segment_code: string | null;
  overall_trend: string | null;
  last_interaction_date: string | null;
}

export interface Contact360Stakeholder {
  buying_role: string | null;
  power_level: number;
  interest_level: number;
  stance: string | null;
  engagement_priority: string | null;
}

export interface Contact360Address {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Contact360Data {
  found: boolean;
  searched_phone: string;
  cleaned_phone?: string;
  contact: Contact360Contact | null;
  contact_phones: Contact360Phone[];
  contact_emails: Contact360Email[];
  contact_social: Contact360Social[];
  contact_interactions: Contact360Interaction[];
  stakeholder: Contact360Stakeholder | null;
  company: Contact360Company | null;
  customer: Contact360Customer | null;
  rfm: Contact360RFM | null;
  company_phones: Contact360Phone[];
  company_emails: Contact360Email[];
  company_address: Contact360Address | null;
  company_social: Contact360Social[];
}

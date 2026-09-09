/**
 * Types for search_contacts_advanced RPC response
 */

export interface SearchContactResult {
  contact_id: string;
  full_name: string | null;
  nome_tratamento: string | null;
  apelido: string | null;
  cargo: string | null;
  departamento: string | null;
  relationship_score: number;
  relationship_stage: string | null;
  sentiment: string | null;
  tags: string[];
  company_id: string | null;
  company_name: string | null;
  company_cnpj: string | null;
  company_logo: string | null;
  company_ramo: string | null;
  company_status: string | null;
  company_estado: string | null;
  company_cidade: string | null;
  vendedor_nome: string | null;
  cliente_ativado: boolean | null;
  ja_comprou: boolean | null;
  total_pedidos: number | null;
  valor_total_compras: number | null;
  ticket_medio: number | null;
  rfm_segment: string | null;
  rfm_score: number | null;
  phone_primary: string | null;
  email_primary: string | null;
  is_whatsapp: boolean;
}

export interface SearchFiltersOptions {
  vendedores: string[];
  ramos: string[];
  rfm_segments: string[];
  estados: string[];
}

export interface SearchContactsResponse {
  results: SearchContactResult[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  filters: SearchFiltersOptions | null;
}

export interface SearchContactsParams {
  search?: string;
  vendedor?: string;
  ramo?: string;
  rfm_segment?: string;
  estado?: string;
  cliente_ativado?: boolean;
  ja_comprou?: boolean;
  sort_by?: 'relevance' | 'name' | 'relationship_score' | 'recent';
  page?: number;
  page_size?: number;
}

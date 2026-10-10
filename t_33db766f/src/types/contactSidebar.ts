/**
 * Contrato da RPC `get_contact_sidebar_by_phone` (banco do Singu), consumida
 * pela edge `crm-integration` com `lookup: 'sidebar'`. Espelha o plano
 * `docs/design/PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md` §3.1.
 *
 * Cada bloco pode ser `null` explicitamente — a UI renderiza "—" por campo e
 * o estado vazio por seção; nenhum valor é inventado no front.
 */

export interface SidebarWhatsapp {
  numero_e164: string | null;
  numero: string | null;
  phone_type: string | null;
}

export interface SidebarEmail {
  email: string;
  is_verified: boolean | null;
}

export interface SidebarEmpresa {
  id: string;
  nome: string | null;
  logo_url: string | null;
}

export interface SidebarProfessional {
  whatsapp: SidebarWhatsapp | null;
  email_corporativo: SidebarEmail | null;
  empresa: SidebarEmpresa | null;
  departamento: string | null;
  cargo: string | null;
}

export interface SidebarSocial {
  plataforma: 'instagram' | 'linkedin' | 'facebook' | 'x' | string;
  handle: string | null;
  url: string | null;
}

export interface SidebarPersonal {
  social: SidebarSocial[];
  data_nascimento: string | null;
}

export interface SidebarDisc {
  primary: string | null;
  blend: string | null;
  confidence: number | null;
  notes: string | null;
}

export interface SidebarVak {
  primary: string | null;
  visual: number | null;
  auditory: number | null;
  kinesthetic: number | null;
}

export interface SidebarBigFive {
  openness: number | null;
  conscientiousness: number | null;
  extraversion: number | null;
  agreeableness: number | null;
  neuroticism: number | null;
  confidence: number | null;
}

export interface SidebarMbti {
  type: string | null;
  e_i: number | null;
  s_n: number | null;
  t_f: number | null;
  j_p: number | null;
}

export interface SidebarEnneagram {
  type: number | null;
  wing: number | null;
  scores: Record<string, number> | null;
}

export interface SidebarTemperament {
  primary: string | null;
  secondary: string | null;
  notes: string | null;
}

export interface SidebarMetaprograms {
  toward: number | null;
  away_from: number | null;
  internal: number | null;
  external: number | null;
  options: number | null;
  procedures: number | null;
  proactive: number | null;
  reactive: number | null;
  global: number | null;
  detail: number | null;
  notes: string | null;
}

export interface SidebarFearsMotivation {
  main_fear: string | null;
  motivation_primary: string | null;
  current_pressure: string | null;
  professional_goals: string | null;
}

export interface SidebarDecision {
  speed: string | null;
  criteria: string[] | null;
  needs_approval: boolean | null;
  approver_name: string | null;
}

export interface SidebarBudget {
  authority: string | null;
  decision_role: string | null;
  decision_power: number | null;
}

export interface SidebarInfluencer {
  contact_id: string;
  name: string | null;
  cargo: string | null;
}

export interface SidebarRapport {
  pacing_speed: string | null;
  voice_tone_preferred: string | null;
  mirroring_technique: string | null;
  preferred_triggers: string[];
  emotional_anchors: string[];
  resistance_triggers: string[];
  notes: string | null;
  channel_scores: {
    visual: number | null;
    auditory: number | null;
    kinesthetic: number | null;
    digital: number | null;
  } | null;
}

export interface SidebarObjectionScript {
  objection_type: string | null;
  script_content: string | null;
  neurological_bias: string | null;
  effectiveness_score: number | null;
}

export interface SinguProfile {
  disc: SidebarDisc | null;
  vak: SidebarVak | null;
  big_five: SidebarBigFive | null;
  mbti: SidebarMbti | null;
  enneagram: SidebarEnneagram | null;
  temperament: SidebarTemperament | null;
  metaprograms: SidebarMetaprograms | null;
  fears_motivation: SidebarFearsMotivation | null;
  decision: SidebarDecision | null;
  budget: SidebarBudget | null;
  influencers: SidebarInfluencer[];
  rapport: SidebarRapport | null;
  objection_scripts: SidebarObjectionScript[];
  assessed_at: string | null;
}

export interface ContactSidebarData {
  found: boolean;
  contact_id?: string;
  professional?: SidebarProfessional | null;
  personal?: SidebarPersonal | null;
  singu_profile?: SinguProfile | null;
}

export type ContactSidebarStatus = 'disabled' | 'loading' | 'not_found' | 'error' | 'ok';

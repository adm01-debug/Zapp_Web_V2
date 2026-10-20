/**
 * RD-007 — modelo de exibição do contato (o que mostrar e o que omitir).
 *
 * Função PURA (sem React, sem banco) que transforma um contato do Zapp (+ o
 * resumo do Singu, quando existe) no que a tela deve mostrar. Regra única:
 * **campo vazio → `null`**, e a tela OMITE a linha. O design antigo
 * (`docs/design/contatos-redesign-2026-10-12/design-comportamento.js`) imprimia
 * 'Empresa não informada', 'Telefone não informado', 'Departamento não
 * informado' — texto de vazio que este modelo proíbe.
 *
 * Telefone: usa `formatPhoneBR` de `@/lib/calls/phone` (o único formatador
 * canônico do módulo; o `formatPhone` antigo de `useContactFormValidation.ts`
 * NÃO é usado). Região/UF: `getRegionFromPhone` devolve texto ('São Paulo - SP'
 * ou o rótulo do país); a UF sai só do sufixo ' - XX' e é `null` nos demais
 * casos — nada é inventado.
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhoneBR, normalizeE164BR } from '@/lib/calls/phone';
import type { ContactSinguSummary } from '@/types/contactSingu';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { getRegionFromPhone } from './getRegionFromPhone';

/** Campos do contato do Zapp que o modelo lê (todos opcionais e nuláveis). */
export interface ContactDisplaySource {
  name?: string | null;
  surname?: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  contact_type?: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
}

/** Dados de fora do contato: resumo do Singu e o nome de empresa já resolvido. */
export interface ContactDisplayExtras {
  /** Resumo do Singu (tipo `ContactSinguSummary`, criado em CT-002). */
  singu?: ContactSinguSummary | null;
  /** Empresa resolvida a montante (ex.: `companyName` da busca) — tem prioridade. */
  companyName?: string | null;
}

export interface ContactDisplay {
  /** Nome + sobrenome. */
  nomeCompleto: string | null;
  /** Apelido (`nickname`). */
  apelido: string | null;
  /** Empresa: `companyName` já resolvido, depois Singu, depois `contact.company`. */
  empresa: string | null;
  /** Departamento (vem do Singu). */
  departamento: string | null;
  /** Cargo: `job_title` do Zapp, senão o cargo do Singu. */
  cargo: string | null;
  /** Telefone formatado ('+55 (11) 99999-2048'). */
  telefone: string | null;
  /** E-mail. */
  email: string | null;
  /** UF (2 letras) extraída da região; `null` quando não há ' - XX'. */
  uf: string | null;
  /** Rótulo da região ('São Paulo - SP'); `null` quando não dá para localizar. */
  regiao: string | null;
  /** 'Último contato em …' ou 'Cadastrado em …'; `null` quando não há data. */
  ultimoContato: string | null;
  /** Rótulo do tipo ('Cliente', 'Fornecedor', …) — nunca vazio. */
  tipo: string;
}

/**
 * Normaliza um texto para exibição: ausente, só com espaços ou o literal 'null'
 * viram `null` (e a tela omite a linha).
 */
function texto(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  if (limpo.length === 0) return null;
  if (limpo.toLowerCase() === 'null') return null;
  return limpo;
}

/** Data ISO → 'dd MMM yyyy' em pt-BR; ausente ou inválida → `null`. */
function formatarData(iso: string | null | undefined): string | null {
  const valor = texto(iso);
  if (valor === null) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return format(data, 'dd MMM yyyy', { locale: ptBR });
}

/** 'Último contato em …' → 'Cadastrado em …' → `null`. */
function rotuloTemporal(contact: ContactDisplaySource): string | null {
  const ultimo = formatarData(contact.last_message_at);
  if (ultimo !== null) return `Último contato em ${ultimo}`;
  const cadastro = formatarData(contact.created_at);
  if (cadastro !== null) return `Cadastrado em ${cadastro}`;
  return null;
}

/**
 * Região e UF a partir do telefone; nada é inventado quando não localiza.
 *
 * A região sai do MESMO número que o formatador exibe: `getRegionFromPhone`
 * espera o país na frente (`55`+DDD…) e, sem ele, um número brasileiro cairia
 * no ramo `startsWith('1')` e viraria 'Estados Unidos'. Por isso normalizamos
 * para E.164 antes; quando não normaliza (legado), usa o valor bruto.
 */
function localidade(telefoneBruto: string | null): { uf: string | null; regiao: string | null } {
  if (telefoneBruto === null) return { uf: null, regiao: null };
  const normalizado = normalizeE164BR(telefoneBruto) ?? telefoneBruto;
  const digitos = normalizado.replace(/\D/g, '');
  // Menos que DDD + assinante não identifica região: não mostra nada.
  if (digitos.length < 10) return { uf: null, regiao: null };

  const regiao = getRegionFromPhone(normalizado);
  const uf = regiao.match(/ - ([A-Z]{2})$/)?.[1] ?? null;
  return { uf, regiao };
}

/** Rótulo do tipo de contato; valor desconhecido ou vazio cai no padrão do módulo. */
function rotuloTipo(tipo: string | null | undefined): string {
  const chave = texto(tipo) ?? 'cliente';
  return (CONTACT_TYPE_CONFIG[chave] ?? CONTACT_TYPE_CONFIG.cliente).label;
}

/**
 * Transforma o contato no modelo de exibição. Todo campo sem conteúdo real vira
 * `null`; a tela decide omitir a linha (nunca imprimir '—'/'não informado').
 */
export function toContactDisplay(
  contact: ContactDisplaySource,
  extras: ContactDisplayExtras = {},
): ContactDisplay {
  const telefoneBruto = texto(contact.phone);
  const { uf, regiao } = localidade(telefoneBruto);

  const empresa =
    texto(extras.companyName) ??
    texto(extras.singu?.empresa) ??
    texto(contact.company);

  const cargo = texto(contact.job_title) ?? texto(extras.singu?.cargo);

  const nomeCompleto =
    [texto(contact.name), texto(contact.surname)].filter((parte) => parte !== null).join(' ') ||
    null;

  return {
    nomeCompleto,
    apelido: texto(contact.nickname),
    empresa,
    departamento: texto(extras.singu?.departamento),
    cargo,
    telefone: telefoneBruto === null ? null : formatPhoneBR(telefoneBruto),
    email: texto(contact.email),
    uf,
    regiao,
    ultimoContato: rotuloTemporal(contact),
    tipo: rotuloTipo(contact.contact_type),
  };
}

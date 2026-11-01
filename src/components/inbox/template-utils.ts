import { User, Building2, Tag, Sparkles, Calendar, LucideIcon } from 'lucide-react';

export interface TemplateVariable {
  key: string;
  label: string;
  icon: LucideIcon;
  example: string;
}

/**
 * Variáveis oferecidas ao usuário no editor de templates.
 *
 * `protocolo` saiu da lista (achado L2 da segunda passada de paridade): não
 * existe número de protocolo real no banco e um protocolo inventado no texto
 * enviado ao cliente é pior que nenhum. Template antigo com `{{protocolo}}`
 * fica PENDENTE, como qualquer variável sem valor.
 */
export const AVAILABLE_VARIABLES: TemplateVariable[] = [
  { key: 'nome', label: 'Nome do contato', icon: User, example: 'João Silva' },
  { key: 'primeiro_nome', label: 'Primeiro nome', icon: User, example: 'João' },
  { key: 'empresa', label: 'Empresa', icon: Building2, example: 'Tech Corp' },
  { key: 'cargo', label: 'Cargo', icon: Tag, example: 'Gerente Comercial' },
  { key: 'saudacao', label: 'Saudação', icon: Sparkles, example: 'Bom dia' },
  { key: 'data_atual', label: 'Data atual', icon: Calendar, example: '06/01/2026' },
  { key: 'atendente', label: 'Nome do atendente', icon: User, example: 'Maria Santos' },
];

export interface TemplateContactData {
  name?: string;
  company?: string;
  job_title?: string;
}

/**
 * Substitui as variáveis `{{chave}}` do texto do template.
 *
 * - `agentName` é o perfil do atendente logado (`profiles.display_name`). Sem
 *   ele `{{atendente}}` fica PENDENTE no texto — nunca trocado por um nome
 *   genérico como "Atendente".
 * - O valor entra por FUNÇÃO (`() => value`), nunca como string de
 *   substituição: em string, `$&`, `$$` e `$1` presentes no nome/empresa do
 *   contato seriam interpretados pelo `String.replace` e corromperiam o texto
 *   (ex.: `A$&B` viraria `A{{nome}}B`).
 * - Variável sem valor (desconhecida, ou `{{atendente}}` sem `agentName`)
 *   permanece como estava, para o chamador poder avisar sobre pendências.
 */
export function replaceVariables(
  content: string,
  contactData?: TemplateContactData,
  customValues?: Record<string, string>,
  agentName?: string
): string {
  const now = new Date();
  const hour = now.getHours();
  let saudacao = 'Bom dia';
  if (hour >= 12 && hour < 18) saudacao = 'Boa tarde';
  if (hour >= 18 || hour < 6) saudacao = 'Boa noite';

  const firstName = contactData?.name?.split(' ')[0] || '';

  const defaultValues: Record<string, string> = {
    nome: contactData?.name || '',
    primeiro_nome: firstName,
    empresa: contactData?.company || '',
    cargo: contactData?.job_title || '',
    saudacao,
    data_atual: now.toLocaleDateString('pt-BR'),
  };

  const atendente = agentName?.trim();
  if (atendente) defaultValues.atendente = atendente;

  const values = { ...defaultValues, ...customValues };
  let result = content;
  Object.entries(values).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), () => value);
  });
  return result;
}

export function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2).toLowerCase()))];
}

/**
 * Preenche as variáveis de uma resposta rápida inserida no chat com os dados do
 * contato da conversa e o nome do atendente logado. O nome do atendente só vale
 * se for um nome de verdade: o rótulo de presença cai no e-mail quando o perfil
 * não tem nome, e e-mail não entra no lugar de `{{atendente}}` (fica pendente).
 */
export function fillQuickReplyVariables(
  content: string,
  contact: { name?: string | null; company?: string | null; job_title?: string | null },
  agentName?: string | null,
): string {
  const atendente = agentName && !agentName.includes('@') ? agentName : undefined;
  return replaceVariables(
    content,
    { name: contact.name ?? undefined, company: contact.company ?? undefined, job_title: contact.job_title ?? undefined },
    undefined,
    atendente,
  );
}

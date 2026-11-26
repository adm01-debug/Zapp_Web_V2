/**
 * Regras dos domínios confiáveis (`app_settings.trusted_domains`).
 *
 * A tabela guarda a lista numa única string separada por vírgula e é lida por
 * `public.handle_new_user_role()` a cada usuário novo: e-mail de domínio listado
 * recebe o papel `agent` automaticamente e gera `role_auto_provisioned` em
 * `audit_logs`; domínio fora da lista não recebe papel e gera
 * `role_auto_provision_denied`. A comparação no banco é EXATA
 * (`v_email_domain = ANY(string_to_array(...))`), então subdomínio precisa estar
 * escrito por inteiro — não há curinga.
 *
 * Ficou fora do `.tsx` porque `react-refresh/only-export-components` só permite
 * componente exportado em arquivo de componente (mesmo motivo dos helpers de
 * `src/components/talkx/tracking/`).
 */

export const TRUSTED_DOMAINS_KEY = 'trusted_domains';

/**
 * Último recurso do `coalesce` de `handle_new_user_role()`: quando a chave está
 * vazia no banco, o domínio abaixo volta a valer. Ou seja, esvaziar a lista NÃO
 * fecha o cadastro automático — volta ao padrão do código.
 */
export const TRUSTED_DOMAINS_FALLBACK = 'promobrindes.com.br';

// Hostname: rótulos de 1-63 caracteres alfanuméricos/hífen (sem hífen nas pontas),
// separados por ponto, exigindo ao menos um ponto (é domínio de e-mail, não host local).
const DOMINIO_VALIDO =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Tira o que costuma vir colado ao copiar de outro lugar: `@`, `https://`, caminho e barras. */
export function normalizarDominio(bruto: string): string {
  return bruto
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\/+/, '')
    .replace(/^@+/, '')
    .split('/')[0]
    .split('?')[0]
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');
}

/**
 * Lista canônica a partir do valor cru do banco (ou de um rascunho da tela):
 * normaliza, descarta vazios e remove repetidos preservando a ordem digitada.
 */
export function parseTrustedDomains(value: string | null | undefined): string[] {
  if (!value) return [];
  const vistos = new Set<string>();
  const dominios: string[] = [];
  for (const bruto of value.split(',')) {
    const dominio = normalizarDominio(bruto);
    if (!dominio || vistos.has(dominio)) continue;
    vistos.add(dominio);
    dominios.push(dominio);
  }
  return dominios;
}

/** Formato exato que `handle_new_user_role()` espera ler (vírgula, sem espaço). */
export function serializeTrustedDomains(dominios: string[]): string {
  return parseTrustedDomains(dominios.join(',')).join(',');
}

/** `null` = pode adicionar; qualquer texto = motivo da recusa já em PT-BR. */
export function validarDominio(bruto: string, existentes: string[]): string | null {
  const dominio = normalizarDominio(bruto);
  if (!dominio) return 'Informe um domínio, por exemplo empresa.com.br';
  if (dominio.includes('@')) return 'Informe apenas o domínio, sem o e-mail (ex.: empresa.com.br)';
  if (!DOMINIO_VALIDO.test(dominio)) {
    return 'Domínio inválido: use letras, números, hífen e ponto (ex.: empresa.com.br)';
  }
  if (existentes.includes(dominio)) return `${dominio} já está na lista`;
  return null;
}

/**
 * O que o cadastro novo realmente aceita hoje. Com a lista salva vazia o banco cai
 * no padrão do código (`TRUSTED_DOMAINS_FALLBACK`), e isso precisa aparecer na tela
 * — senão o admin acha que "esvaziei e fechei", mas continua aceitando.
 */
export function dominiosEfetivos(dominios: string[]): string[] {
  return dominios.length > 0 ? dominios : [TRUSTED_DOMAINS_FALLBACK];
}
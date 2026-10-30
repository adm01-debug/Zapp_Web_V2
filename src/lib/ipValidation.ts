/**
 * Validação de IP e CIDR das telas de Segurança (whitelist e bloqueio de IPs).
 *
 * O que estas telas aceitavam antes: um regex que só media o FORMATO —
 * `(\d{1,3}\.){3}\d{1,3}` em `BlockedIPDialogs.tsx` e
 * `(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?` em `IPWhitelistPanel.tsx`. Com ele,
 * `999.999.999.999`, `256.0.0.1` e `192.168.1.0/99` passavam e viravam linha
 * inválida no banco (ou bloqueio que não pega ninguém). IPv6 não era citado,
 * embora a coluna guarde as duas famílias.
 *
 * Regras:
 * - IPv4: 4 grupos de 1 a 3 dígitos, cada um de 0 a 255.
 * - IPv6: grupos hexadecimais de 1 a 4 dígitos, com `::` comprimindo os zeros
 *   (no máximo um `::`; no total, até 7 grupos com a compressão).
 * - CIDR: `/n` só depois de um IP válido, com n coerente com a família —
 *   0..32 para IPv4, 0..128 para IPv6. `/99` e `/200` são recusados.
 * - Espaços nas pontas não invalidam (`' 10.0.0.1 '` vale); o valor que segue
 *   para o banco é sempre `normalizeIpInput(...)`.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const GRUPO_IPV6 = /^[0-9a-fA-F]{1,4}$/;
const PREFIXO = /^\d{1,3}$/;

export function isValidIPv4(host: string): boolean {
  const grupos = IPV4.exec(host);
  if (!grupos) return false;
  return grupos.slice(1).every((octeto) => Number(octeto) <= 255);
}

export function isValidIPv6(host: string): boolean {
  if (host.length === 0) return false;

  const compressao = host.indexOf('::');
  if (compressao >= 0 && host.indexOf('::', compressao + 1) >= 0) return false; // dois `::`

  const particionar = (parte: string) => (parte.length === 0 ? [] : parte.split(':'));
  const esquerda = particionar(compressao >= 0 ? host.slice(0, compressao) : host);
  const direita = particionar(compressao >= 0 ? host.slice(compressao + 2) : '');

  if (compressao < 0) {
    return esquerda.length === 8 && esquerda.every((grupo) => GRUPO_IPV6.test(grupo));
  }

  // Com `::`, a compressão representa ao menos um grupo: sobram no máximo 7.
  return esquerda.length + direita.length <= 7 && [...esquerda, ...direita].every((grupo) => GRUPO_IPV6.test(grupo));
}

/** Aceita IPv4, IPv6 e CIDR das duas famílias; recusa octeto e prefixo incoerentes. */
export function isValidIpOrCidr(input: string): boolean {
  const valor = input.trim();
  if (valor.length === 0) return false;

  const partes = valor.split('/');
  if (partes.length > 2) return false;

  const [host, prefixo] = partes;
  const ehIPv4 = isValidIPv4(host);
  const ehIPv6 = !ehIPv4 && isValidIPv6(host);
  if (!ehIPv4 && !ehIPv6) return false;

  if (prefixo === undefined) return true;
  if (!PREFIXO.test(prefixo)) return false;

  const tamanho = Number(prefixo);
  return tamanho <= (ehIPv4 ? 32 : 128);
}

/** O valor que vai para o banco: sem os espaços que o input costuma trazer. */
export function normalizeIpInput(input: string): string {
  return input.trim();
}

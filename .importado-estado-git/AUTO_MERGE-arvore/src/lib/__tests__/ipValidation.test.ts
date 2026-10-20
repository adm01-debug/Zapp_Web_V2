/**
 * Validação de IP/CIDR usada pela whitelist e pelo bloqueio de IPs.
 *
 * O que a tela aceitava antes (BlockedIPDialogs.tsx e IPWhitelistPanel.tsx):
 * um regex que só media o FORMATO — `(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?` — então
 * `999.999.999.999`, `256.0.0.1` e `192.168.1.0/99` passavam e viravam linha
 * inválida no banco. IPv6 não era citado, embora a coluna guarde os dois.
 *
 * Como este teste prova: chama o validador REAL, sem mock, em cada família
 * (IPv4, IPv6, CIDR) e nos valores-limite de octeto e de prefixo.
 */
import { describe, expect, it } from 'vitest';
import { isValidIpOrCidr, normalizeIpInput } from '../ipValidation';

describe('isValidIpOrCidr — IPv4', () => {
  it.each([
    '192.168.1.1',
    '0.0.0.0',
    '255.255.255.255',
    '10.0.0.1',
    '172.16.254.1',
  ])('aceita %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(true);
  });

  it.each([
    '999.999.999.999', // octeto acima de 255
    '256.0.0.1', // octeto acima de 255
    '300.1.1.1',
    '192.168.1', // grupo faltando
    '192.168.1.1.1', // grupo a mais
    'abc', // texto
    '', // vazio
    '192.168.1.-1',
  ])('recusa %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(false);
  });
});

describe('isValidIpOrCidr — IPv6', () => {
  it.each([
    '2001:db8::1',
    '::1',
    '::',
    'fe80::',
    '2001:0db8:0000:0000:0000:0000:0000:0001',
    '2001:db8:85a3::8a2e:370:7334',
  ])('aceita %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(true);
  });

  it.each([
    '2001:db8::1::2', // dois `::`
    '2001:db8:85a3:0:0:0:0:0:1', // grupos a mais
    'gggg::1', // hex inválido
    '2001:db8:85a3:0:0:0:0', // grupos a menos, sem `::`
  ])('recusa %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(false);
  });
});

describe('isValidIpOrCidr — CIDR', () => {
  it.each([
    '192.168.1.0/24',
    '10.0.0.0/8',
    '0.0.0.0/0',
    '192.168.1.1/32',
    '2001:db8::/64',
    '::1/128',
  ])('aceita %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(true);
  });

  it.each([
    '192.168.1.0/99', // prefixo impossível em IPv4
    '192.168.1.0/33',
    '2001:db8::/129', // prefixo impossível em IPv6
    '2001:db8::/200',
    '999.1.1.1/24', // host inválido
    '192.168.1.1/', // prefixo vazio
    '/24', // host vazio
    '192.168.1.0/24/24', // duas barras
    '192.168.1.0/xx',
  ])('recusa %s', (valor) => {
    expect(isValidIpOrCidr(valor)).toBe(false);
  });
});

describe('espaços nas pontas', () => {
  it('não invalidam o valor', () => {
    expect(isValidIpOrCidr('  10.0.0.1  ')).toBe(true);
    expect(isValidIpOrCidr('\t192.168.1.0/24\n')).toBe(true);
    expect(isValidIpOrCidr(' 2001:db8::1 ')).toBe(true);
  });

  it('normalizeIpInput devolve o valor sem espaços (é o que vai para o banco)', () => {
    expect(normalizeIpInput('  10.0.0.1  ')).toBe('10.0.0.1');
    expect(normalizeIpInput('192.168.1.0/24')).toBe('192.168.1.0/24');
  });
});

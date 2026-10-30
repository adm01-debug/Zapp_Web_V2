import { describe, expect, it } from 'vitest';
import { isValidCnpj } from '@/lib/cnpjUtils';

describe('isValidCnpj — validação de dígito verificador', () => {
  it('aceita CNPJs válidos conhecidos, com ou sem máscara', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
  });

  it('rejeita dígito verificador incorreto (regressão: antes não havia validação alguma)', () => {
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-99')).toBe(false);
  });

  it('rejeita sequências repetidas que passariam no cálculo de dígito', () => {
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('99999999999999')).toBe(false);
  });

  it('rejeita entradas com tamanho incorreto ou vazias', () => {
    expect(isValidCnpj('')).toBe(false);
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-810')).toBe(false);
  });
});

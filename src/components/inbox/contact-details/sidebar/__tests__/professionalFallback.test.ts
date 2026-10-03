import { describe, expect, it } from 'vitest';
import { buildProfessionalFallback } from '../professionalFallback';

describe('buildProfessionalFallback', () => {
  it('monta o fallback com os dados locais do Zapp', () => {
    const result = buildProfessionalFallback(
      { phone: '+55 11 99999-0000', email: 'joao@empresa.com' },
      { company: 'Promo Brindes', job_title: 'Diretor' },
    );
    expect(result).toEqual({
      whatsapp: '+55 11 99999-0000',
      email: 'joao@empresa.com',
      empresa: 'Promo Brindes',
      cargo: 'Diretor',
      departamento: null,
    });
  });

  it('enrichedData parcial preenche só o que existe', () => {
    const result = buildProfessionalFallback(
      { phone: '5511999', email: null },
      { company: null, job_title: 'Gerente' },
    );
    expect(result).toEqual({
      whatsapp: '5511999',
      email: null,
      empresa: null,
      cargo: 'Gerente',
      departamento: null,
    });
  });

  it('sem enrichedData devolve só telefone e e-mail do contato', () => {
    const result = buildProfessionalFallback({ phone: '5511999', email: 'a@b.c' });
    expect(result).toEqual({
      whatsapp: '5511999',
      email: 'a@b.c',
      empresa: null,
      cargo: null,
      departamento: null,
    });
  });

  it('nunca inventa departamento (não existe no modelo local)', () => {
    expect(buildProfessionalFallback({ phone: '1' }, { company: 'X', job_title: 'Y' }).departamento).toBeNull();
  });
});

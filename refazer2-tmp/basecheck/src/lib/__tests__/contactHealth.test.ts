/**
 * Completude do cadastro do contato (src/lib/contactHealth.ts).
 *
 * Prova os pontos que o cartão pede:
 *  - pesos documentados e somando 100, com a etiqueta (tags) FORA da conta;
 *  - chave ausente (`undefined`) = não avaliado (não pune e não aparece em "Faltam");
 *  - `null`/vazio/só espaços = avaliado e faltando, com o rótulo em pt-BR;
 *  - nota normalizada e faixas de nível.
 */
import { describe, it, expect } from 'vitest';
import { CONTACT_HEALTH_FIELDS, calculateContactHealth, type ContactHealthInput } from '../contactHealth';

const CHEIO: ContactHealthInput = {
  name: 'Ana Souza',
  phone: '5511999999999',
  email: 'ana@exemplo.com',
  company: 'Promo Brindes',
  job_title: 'Compras',
  contact_type: 'cliente',
  address: 'Rua A, 100',
  assigned_to: 'u-1',
};

describe('contactHealth — pesos e campos', () => {
  it('os 8 pesos somam 100 e a etiqueta (tags) não pontua', () => {
    const pesos = CONTACT_HEALTH_FIELDS.map((f) => f.weight);
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(100);
    expect(CONTACT_HEALTH_FIELDS.map((f) => f.key)).not.toContain('tags');
    expect(CONTACT_HEALTH_FIELDS.map((f) => f.key)).toEqual([
      'name', 'phone', 'email', 'company', 'job_title', 'contact_type', 'address', 'assigned_to',
    ]);
  });

  it('contato com os 8 campos é 100% — Completo, sem faltas', () => {
    const health = calculateContactHealth(CHEIO);
    expect(health.score).toBe(100);
    expect(health.level).toBe('completo');
    expect(health.label).toBe('Completo');
    expect(health.missing).toEqual([]);
    expect(health.filledCount).toBe(8);
    expect(health.evaluatedCount).toBe(8);
  });

  it('não muta o contato recebido', () => {
    const entrada = { ...CHEIO };
    calculateContactHealth(entrada);
    expect(entrada).toEqual(CHEIO);
  });
});

describe('contactHealth — o que conta como preenchido', () => {
  it('nome com 2 caracteres e telefone com menos de 8 dígitos NÃO contam', () => {
    const health = calculateContactHealth({ name: 'Al', phone: '119' });
    expect(health.filledCount).toBe(0);
    expect(health.missing).toEqual([
      { key: 'name', label: 'Nome' },
      { key: 'phone', label: 'Telefone' },
    ]);
    expect(health.score).toBe(0);
    expect(health.level).toBe('critico');
  });

  it('e-mail sem @, null, string vazia e só espaços faltam', () => {
    const health = calculateContactHealth({
      name: 'Ana Souza',
      phone: '5511999999999',
      email: 'ana.silva',
      company: null,
      job_title: '',
      contact_type: '   ',
    });
    expect(health.missing).toEqual([
      { key: 'email', label: 'E-mail' },
      { key: 'company', label: 'Empresa' },
      { key: 'job_title', label: 'Cargo' },
      { key: 'contact_type', label: 'Tipo' },
    ]);
    // 40 preenchidos (nome+telefone) de 85 avaliados = 47%
    expect(health.score).toBe(47);
    expect(health.level).toBe('incompleto');
  });
});

describe('contactHealth — chave ausente é "não avaliado"', () => {
  it('endereço ausente não vira falta e a nota é normalizada pelos campos presentes', () => {
    const semEndereco: ContactHealthInput = {
      name: 'Ana Souza',
      phone: '5511999999999',
      email: 'ana@exemplo.com',
      company: 'Promo Brindes',
      job_title: 'Compras',
      contact_type: 'cliente',
    };
    const health = calculateContactHealth(semEndereco);
    expect(health.score).toBe(100);
    expect(health.missing).toEqual([]);
    expect(health.evaluatedCount).toBe(6);
    // `assigned_to` (5) segue fora da conta, como na lista (search_contacts não devolve).
    expect(health.evaluatedCount).toBe(CONTACT_HEALTH_FIELDS.length - 2);
  });

  it('endereço presente e vazio É falta, mesmo com o resto cheio', () => {
    const health = calculateContactHealth({ ...CHEIO, address: null, assigned_to: undefined });
    expect(health.missing).toEqual([{ key: 'address', label: 'Endereço' }]);
    // 85 preenchidos de 95 avaliados = 89%
    expect(health.score).toBe(89);
    expect(health.level).toBe('bom');
  });

  it('contato vazio/ausente não inventa nota: Sem dados e sem lista de faltas', () => {
    for (const entrada of [{}, null, undefined]) {
      const health = calculateContactHealth(entrada);
      expect(health.score).toBe(0);
      expect(health.level).toBe('indefinido');
      expect(health.label).toBe('Sem dados');
      expect(health.missing).toEqual([]);
      expect(health.evaluatedCount).toBe(0);
    }
  });
});

describe('contactHealth — limites das faixas', () => {
  it('70% já é Bom, 40% já é Incompleto e 36% é Crítico', () => {
    // 20+20+15+10+5 = 70 (todos os 8 campos presentes => denominador 100)
    const bom = calculateContactHealth({
      name: 'Ana Souza',
      phone: '5511999999999',
      email: 'ana@exemplo.com',
      company: 'Promo Brindes',
      job_title: null,
      contact_type: null,
      address: null,
      assigned_to: 'u-1',
    });
    expect(bom.score).toBe(70);
    expect(bom.label).toBe('Bom');

    // nome+telefone preenchidos (40) de 100 avaliados
    const incompleto = calculateContactHealth({
      name: 'Ana Souza', phone: '5511999999999', email: null, company: null,
      job_title: null, contact_type: null, address: null, assigned_to: null,
    });
    expect(incompleto.score).toBe(40);
    expect(incompleto.label).toBe('Incompleto');

    // só o nome (20) de 55 avaliados (nome+telefone+e-mail) = 36,5% => 37%
    const critico = calculateContactHealth({ name: 'Ana Souza', phone: null, email: null });
    expect(critico.score).toBe(36);
    expect(critico.label).toBe('Crítico');
  });
});

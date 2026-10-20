/**
 * A4-D (auditoria adversarial, onda 2): o segundo defeito do editor vazio não é a query — é o
 * objeto que os chamadores montam para o diálogo. Eles repassavam só 10 campos (e nem os mesmos
 * dez), então nem um endereço já carregado chegava ao formulário.
 */
import { describe, expect, it } from 'vitest';
import { buildEditContactShape } from '../editContactShape';

const contato = { id: 'c1', name: 'João', phone: '5511999999999' };
const enderecoCompleto = {
  address: 'Rua das Flores',
  address_number: '100',
  city: 'São Paulo',
  neighborhood: 'Centro',
  postal_code: '01000-000',
  state: 'SP',
};

describe('buildEditContactShape — endereço (A4-D)', () => {
  it('repassa as 6 colunas de endereço vindas do dado enriquecido', () => {
    const shape = buildEditContactShape({ contact: contato, enrichedData: enderecoCompleto });

    expect(shape).toMatchObject(enderecoCompleto);
  });

  it('usa o endereço do próprio contato quando a query não trouxe (rede de segurança)', () => {
    const shape = buildEditContactShape({
      contact: { ...contato, ...enderecoCompleto },
      enrichedData: null,
    });

    expect(shape).toMatchObject(enderecoCompleto);
  });

  it('o dado enriquecido vence o do contato quando os dois existem', () => {
    const shape = buildEditContactShape({
      contact: { ...contato, city: 'Cidade velha' },
      enrichedData: { ...enderecoCompleto, city: 'Cidade nova' },
    });

    expect(shape.city).toBe('Cidade nova');
  });

  it('sem endereço nenhum, os campos ficam undefined (e não string vazia)', () => {
    const shape = buildEditContactShape({ contact: contato });

    for (const chave of ['address', 'city', 'postal_code', 'state', 'neighborhood', 'address_number']) {
      expect(shape[chave as keyof typeof shape]).toBeUndefined();
    }
  });

  it('não perde os campos que já eram repassados', () => {
    const shape = buildEditContactShape({
      contact: contato,
      enrichedData: { ...enderecoCompleto, nickname: 'Joãozinho', company: 'XBZ', job_title: 'Diretor', surname: 'Silva', contact_type: 'lead', ai_sentiment: null, ai_priority: null, channel_type: null },
    });

    expect(shape).toMatchObject({ nickname: 'Joãozinho', company: 'XBZ', job_title: 'Diretor', surname: 'Silva', contact_type: 'lead' });
  });
});

/**
 * Item 5 (decisão 20260930-122408-sem-tarefa, opção a): o `EditContactDialog` já aceitava
 * latitude/longitude no tipo, no estado e nos parsers — mas o shape nunca as entregava, então o
 * form abria com a coordenada VAZIA e o operador não enxergava o pino já gravado.
 */
describe('buildEditContactShape — coordenada (item 5)', () => {
  const coordenada = { latitude: -23.5613, longitude: -46.6565 };

  it('repassa latitude/longitude vindas do dado enriquecido', () => {
    const shape = buildEditContactShape({ contact: contato, enrichedData: coordenada });

    expect(shape.latitude).toBe(-23.5613);
    expect(shape.longitude).toBe(-46.6565);
  });

  it('usa a coordenada do próprio contato quando a query não trouxe (rede de segurança)', () => {
    const shape = buildEditContactShape({
      contact: { ...contato, ...coordenada },
      enrichedData: null,
    });

    expect(shape.latitude).toBe(-23.5613);
    expect(shape.longitude).toBe(-46.6565);
  });

  it('sem coordenada nenhuma fica undefined — e o Salvar por diferença não grava null por cima', () => {
    const shape = buildEditContactShape({ contact: contato });

    expect(shape.latitude).toBeUndefined();
    expect(shape.longitude).toBeUndefined();
  });
});

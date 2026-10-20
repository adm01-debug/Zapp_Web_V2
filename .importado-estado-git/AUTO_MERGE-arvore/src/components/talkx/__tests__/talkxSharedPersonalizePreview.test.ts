import { describe, expect, it } from 'vitest';
import { personalizePreview } from '../talkxShared';

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

describe('Talk X wizard preview matches the real send (personalize())', () => {
  it('resolves the built-in placeholders', () => {
    expect(personalizePreview('Ola {{nome}}, aqui e da {{empresa}}', contact)).toBe('Ola Joao, aqui e da Empresa Teste');
  });

  it('falls back to a bracket placeholder for a custom variable with no value', () => {
    expect(personalizePreview('Seu cargo e {{cargo}}', contact)).toBe('Seu cargo e [cargo]');
  });

  it('substitutes the real value when a sample custom field is provided', () => {
    // Regressão: sem os campos customizados reais do contato de exemplo, o
    // preview sempre mostrava "[cargo]" mesmo quando o envio real já
    // resolvia o dado verdadeiro de contact_custom_fields.
    expect(personalizePreview('Seu cargo e {{cargo}}', contact, { cargo: 'Diretor de Vendas' })).toBe('Seu cargo e Diretor de Vendas');
  });

  it('matches a custom field key case-insensitively', () => {
    expect(personalizePreview('CPF: {{cpf}}', contact, { CPF: '000.000.000-00' })).toBe('CPF: 000.000.000-00');
  });

  it('ignores a custom value using a reserved built-in name', () => {
    expect(personalizePreview('Nome: {{nome}}', contact, { nome: 'Valor Errado' })).toBe('Nome: Joao');
  });

  it('does not reinterpret placeholder-shaped text inside a custom value', () => {
    expect(personalizePreview('Cargo: {{cargo}}', contact, { cargo: '{{empresa}}' })).toBe('Cargo: {{empresa}}');
  });
});

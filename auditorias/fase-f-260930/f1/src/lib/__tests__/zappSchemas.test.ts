import { describe, it, expect } from 'vitest';
import { contatoSchema, campanhaSchema, zappImportTemplates, zappFilterConfigs } from '@/lib/zappSchemas';

describe('zappSchemas', () => {
  describe('contatoSchema', () => {
    it('validates valid contact', () => {
      const result = contatoSchema.safeParse({ nome: 'João', telefone: '11999999999' });
      expect(result.success).toBe(true);
    });

    it('rejects missing nome', () => {
      const result = contatoSchema.safeParse({ telefone: '11999999999' });
      expect(result.success).toBe(false);
    });

    it('rejects empty nome', () => {
      const result = contatoSchema.safeParse({ nome: '', telefone: '11999999999' });
      expect(result.success).toBe(false);
    });

    it('rejects short telefone', () => {
      const result = contatoSchema.safeParse({ nome: 'João', telefone: '123' });
      expect(result.success).toBe(false);
    });

    it('allows optional email', () => {
      const result = contatoSchema.safeParse({ nome: 'João', telefone: '11999999999', email: 'j@e.com' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = contatoSchema.safeParse({ nome: 'João', telefone: '11999999999', email: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('allows optional tags', () => {
      const result = contatoSchema.safeParse({ nome: 'João', telefone: '11999999999', tags: ['vip'] });
      expect(result.success).toBe(true);
    });

    it('defaults ativo to true', () => {
      const result = contatoSchema.parse({ nome: 'João', telefone: '11999999999' });
      expect(result.ativo).toBe(true);
    });

    it('coerces ativo string to boolean', () => {
      const result = contatoSchema.parse({ nome: 'João', telefone: '11999999999', ativo: 'true' });
      expect(result.ativo).toBe(true);
    });

    it('allows optional grupo_id as uuid', () => {
      const result = contatoSchema.safeParse({
        nome: 'João',
        telefone: '11999999999',
        grupo_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-uuid grupo_id', () => {
      const result = contatoSchema.safeParse({
        nome: 'João',
        telefone: '11999999999',
        grupo_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('campanhaSchema', () => {
    it('validates valid campanha', () => {
      const result = campanhaSchema.safeParse({ nome: 'Black Friday', mensagem: 'Promoção!' });
      expect(result.success).toBe(true);
    });

    it('rejects missing nome', () => {
      const result = campanhaSchema.safeParse({ mensagem: 'Promoção!' });
      expect(result.success).toBe(false);
    });

    it('rejects missing mensagem', () => {
      const result = campanhaSchema.safeParse({ nome: 'Black Friday' });
      expect(result.success).toBe(false);
    });

    it('defaults status to rascunho', () => {
      const result = campanhaSchema.parse({ nome: 'BF', mensagem: 'Hi' });
      expect(result.status).toBe('rascunho');
    });

    it('accepts valid status values', () => {
      const statuses = ['rascunho', 'agendada', 'enviando', 'concluida', 'cancelada'] as const;
      statuses.forEach(status => {
        const result = campanhaSchema.safeParse({ nome: 'BF', mensagem: 'Hi', status });
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid status', () => {
      const result = campanhaSchema.safeParse({ nome: 'BF', mensagem: 'Hi', status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('defaults total_contatos to 0', () => {
      const result = campanhaSchema.parse({ nome: 'BF', mensagem: 'Hi' });
      expect(result.total_contatos).toBe(0);
    });

    it('defaults enviados to 0', () => {
      const result = campanhaSchema.parse({ nome: 'BF', mensagem: 'Hi' });
      expect(result.enviados).toBe(0);
    });

    it('defaults erros to 0', () => {
      const result = campanhaSchema.parse({ nome: 'BF', mensagem: 'Hi' });
      expect(result.erros).toBe(0);
    });

    it('coerces numeric strings', () => {
      const result = campanhaSchema.parse({ nome: 'BF', mensagem: 'Hi', total_contatos: '100' });
      expect(result.total_contatos).toBe(100);
    });

    it('rejects negative total_contatos', () => {
      const result = campanhaSchema.safeParse({ nome: 'BF', mensagem: 'Hi', total_contatos: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('zappImportTemplates', () => {
    it('has contatos template', () => {
      expect(zappImportTemplates.contatos).toHaveLength(4);
    });

    it('contatos template has required keys', () => {
      const keys = zappImportTemplates.contatos.map(t => t.key);
      expect(keys).toContain('nome');
      expect(keys).toContain('telefone');
      expect(keys).toContain('email');
      expect(keys).toContain('tags');
    });

    it('each template entry has key, label and example', () => {
      zappImportTemplates.contatos.forEach(t => {
        expect(t.key).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.example).toBeTruthy();
      });
    });
  });

  describe('zappFilterConfigs', () => {
    it('has contatos config', () => {
      expect(zappFilterConfigs.contatos).toHaveLength(2);
    });

    it('has campanhas config', () => {
      expect(zappFilterConfigs.campanhas).toHaveLength(1);
    });

    it('contatos has ativo filter', () => {
      const ativo = zappFilterConfigs.contatos.find(f => f.key === 'ativo');
      expect(ativo).toBeTruthy();
      expect(ativo!.type).toBe('select');
    });

    it('campanhas has status filter with options', () => {
      const status = zappFilterConfigs.campanhas.find(f => f.key === 'status');
      expect(status).toBeTruthy();
      expect(status!.options.length).toBe(4);
    });
  });
});

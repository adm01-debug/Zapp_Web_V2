import { describe, it, expect } from 'vitest';
import {
  parseTemplateFile,
  serializeTemplatesToCsv,
  serializeTemplatesToJson,
  TEMPLATE_FILE_MAX_ROWS,
} from '../talkxTemplateFile';

const UTF8_BOM = '﻿';
const NO_CONFLICTS = new Set<string>();

describe('X093 · talkxTemplateFile — parseTemplateFile', () => {
  it('CSV básico com cabeçalho name;content', () => {
    const csv = 'name;content\nOlá mundo;Mensagem de boas-vindas';
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].raw.name).toBe('Olá mundo');
    expect(r.rows[0].raw.content).toBe('Mensagem de boas-vindas');
    expect(r.rows[0].issues).toHaveLength(0);
  });

  it('CSV com BOM é limpo', () => {
    const csv = `${UTF8_BOM}name;content\nTemplate;Conteúdo`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows[0].raw.name).toBe('Template');
  });

  it('CSV com aspas duplas em campo', () => {
    const csv = `name;content\n"Nome ""especial""";Conteúdo normal`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe('Nome "especial"');
  });

  it('CSV com separador ; dentro de campo entre aspas', () => {
    const csv = `name;content\n"Promoção; Desconto";Temos promoções`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe('Promoção; Desconto');
  });

  it('CSV com quebra de linha no campo (não suportado inline, mas não trava)', () => {
    const csv = `name;content\nTemplate A;Linha 1\nTemplate B;Linha 2`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('CSV sem colunas name/content retorna fatalError', () => {
    const csv = 'titulo;corpo\nFoo;Bar';
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
  });

  it('JSON array válido', () => {
    const json = JSON.stringify([
      { name: 'Template A', content: 'Corpo A', category: 'vendas' },
      { name: 'Template B', content: 'Corpo B' },
    ]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].raw.category).toBe('vendas');
  });

  it('JSON inválido retorna fatalError', () => {
    const r = parseTemplateFile('{ not valid json ]', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
    expect(r.fatalError).toMatch(/JSON inválido/);
  });

  it('JSON não-array retorna fatalError', () => {
    const r = parseTemplateFile('{"name":"foo","content":"bar"}', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
  });

  it('Valida nome ausente', () => {
    const json = JSON.stringify([{ name: '', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('Valida nome > 1024 caracteres', () => {
    const json = JSON.stringify([{ name: 'A'.repeat(1025), content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('Valida conteúdo ausente', () => {
    const json = JSON.stringify([{ name: 'Template', content: '' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'content')).toBe(true);
  });

  it('Valida categoria desconhecida', () => {
    const json = JSON.stringify([{ name: 'Template', content: 'Corpo', category: 'inexistente' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'category')).toBe(true);
  });

  it('Detecta conflito com existente', () => {
    const json = JSON.stringify([{ name: 'Existente', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', new Set(['Existente']));
    expect(r.rows[0].isConflict).toBe(true);
  });

  it('Não detecta conflito quando nome é novo', () => {
    const json = JSON.stringify([{ name: 'Novo', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', new Set(['Existente']));
    expect(r.rows[0].isConflict).toBe(false);
  });

  it(`Trunca ao atingir ${TEMPLATE_FILE_MAX_ROWS} linhas`, () => {
    const rows = Array.from({ length: TEMPLATE_FILE_MAX_ROWS + 5 }, (_, i) => ({ name: `T${i}`, content: 'C' }));
    const r = parseTemplateFile(JSON.stringify(rows), 'json', NO_CONFLICTS);
    expect(r.truncated).toBe(true);
    expect(r.rows).toHaveLength(TEMPLATE_FILE_MAX_ROWS);
  });
});

describe('X093 · talkxTemplateFile — serializeTemplatesToCsv', () => {
  it('produz BOM + cabeçalho + linha de dados', () => {
    const csv = serializeTemplatesToCsv([{ name: 'Oi', content: 'Msg', category: 'vendas' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('name;content');
    expect(csv).toContain('Oi;Msg;');
  });

  it('neutraliza célula que começa com =', () => {
    const csv = serializeTemplatesToCsv([{ name: '=cmd()', content: 'ok' }]);
    expect(csv).toContain("'=cmd()");
  });

  it('neutraliza célula que começa com +', () => {
    const csv = serializeTemplatesToCsv([{ name: '+1234', content: 'ok' }]);
    expect(csv).toContain("'+1234");
  });

  it('neutraliza célula que começa com -', () => {
    const csv = serializeTemplatesToCsv([{ name: '-fórmula', content: 'ok' }]);
    expect(csv).toContain("'-fórmula");
  });

  it('neutraliza célula que começa com @', () => {
    const csv = serializeTemplatesToCsv([{ name: '@sum', content: 'ok' }]);
    expect(csv).toContain("'@sum");
  });

  it('faz round-trip CSV: serialize → parse', () => {
    const templates = [
      { name: 'T1', content: 'Corpo 1', category: 'vendas', description: 'Desc' },
      { name: 'T2;separador', content: 'Corpo 2' },
      { name: 'T3 "aspas"', content: 'Ok' },
    ];
    const csv = serializeTemplatesToCsv(templates);
    const parsed = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(parsed.rows[0].raw.name).toBe('T1');
    expect(parsed.rows[1].raw.name).toBe('T2;separador');
    expect(parsed.rows[2].raw.name).toBe('T3 "aspas"');
  });
});

describe('X093 · talkxTemplateFile — serializeTemplatesToJson', () => {
  it('produz JSON array válido', () => {
    const json = serializeTemplatesToJson([{ name: 'T', content: 'C' }]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('T');
  });
});

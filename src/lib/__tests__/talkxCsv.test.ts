import { describe, expect, it, vi, beforeEach } from 'vitest';
import { serializeTalkXCsv, downloadCsv } from '../talkxCsv';

/**
 * X168 — Serializer CSV para exportação de relatório do Talk X.
 * Cobre: separador, BOM, aspas, quebra de linha, acentos, injeção de fórmula.
 */
describe('X168 · serializeTalkXCsv', () => {
  it('inclui BOM UTF-8 no início do arquivo', () => {
    const csv = serializeTalkXCsv([{ a: '1' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('usa ponto-e-vírgula como separador', () => {
    const csv = serializeTalkXCsv([{ nome: 'Alice', telefone: '11999999999' }]);
    const lines = csv.replace('﻿', '').split('\n');
    expect(lines[0]).toBe('nome;telefone');
    expect(lines[1]).toBe('Alice;11999999999');
  });

  it('escapa campo com aspas duplas', () => {
    const csv = serializeTalkXCsv([{ texto: 'diz "olá"' }]);
    expect(csv).toContain('"diz ""olá"""');
  });

  it('escapa campo com separador ; dentro', () => {
    const csv = serializeTalkXCsv([{ valor: 'a;b' }]);
    expect(csv).toContain('"a;b"');
  });

  it('escapa campo com quebra de linha', () => {
    const csv = serializeTalkXCsv([{ obs: 'linha1\nlinha2' }]);
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it('preserva acentos (UTF-8)', () => {
    const csv = serializeTalkXCsv([{ cidade: 'São Paulo' }]);
    expect(csv).toContain('São Paulo');
  });

  it("protege contra injeção: =CMD() vira '=CMD()", () => {
    const csv = serializeTalkXCsv([{ formula: '=CMD()' }]);
    const lines = csv.replace('﻿', '').split('\n');
    expect(lines[1]).toBe("'=CMD()");
  });

  it('protege contra injeção com prefixo +', () => {
    const csv = serializeTalkXCsv([{ val: '+1234' }]);
    expect(csv).toContain("'+1234");
  });

  it('protege contra injeção com prefixo -', () => {
    const csv = serializeTalkXCsv([{ val: '-DROP TABLE' }]);
    expect(csv).toContain("'-DROP TABLE");
  });

  it('protege contra injeção com prefixo @', () => {
    const csv = serializeTalkXCsv([{ val: '@SUM(A1:A10)' }]);
    expect(csv).toContain("'@SUM(A1:A10)");
  });

  it('protege contra injeção com TAB inicial', () => {
    const csv = serializeTalkXCsv([{ val: '\t=evil' }]);
    expect(csv).toContain("'\t=evil");
  });

  it('respeita colunas customizadas (ordem e header)', () => {
    const rows = [{ id: '1', name: 'Bob', age: '30' }];
    const csv = serializeTalkXCsv(rows, [
      { key: 'name', header: 'Nome' },
      { key: 'age', header: 'Idade' },
    ]);
    const lines = csv.replace('﻿', '').split('\n');
    expect(lines[0]).toBe('Nome;Idade');
    expect(lines[1]).toBe('Bob;30');
  });

  it('trata valores null/undefined como string vazia', () => {
    const rows = [{ a: null as unknown as string, b: undefined as unknown as string }];
    const csv = serializeTalkXCsv(rows);
    const lines = csv.replace('﻿', '').split('\n');
    expect(lines[1]).toBe(';');
  });

  it('retorna apenas header quando rows está vazio', () => {
    const csv = serializeTalkXCsv([], [{ key: 'x' as never, header: 'X' }]);
    const lines = csv.replace('﻿', '').split('\n');
    expect(lines[0]).toBe('X');
    expect(lines[1]).toBe('');
  });
});

describe('X168 · downloadCsv', () => {
  beforeEach(() => {
    // Stub de URL.createObjectURL e revokeObjectURL
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() },
      writable: true,
    });
  });

  it('cria um elemento <a> com o download correto', () => {
    const clickSpy = vi.fn();
    const createElSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLElement);

    downloadCsv('relatorio.csv', '﻿a;b\n1;2');
    expect(createElSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalledOnce();
    createElSpy.mockRestore();
  });
});

import { describe, expect, it } from 'vitest';
import { talkxCsvCell, talkxCsvSerialize } from '../talkxCsv';

describe('talkxCsv (X168)', () => {
  it('começa com BOM UTF-8 e separa por ponto e vírgula', () => {
    const csv = talkxCsvSerialize(['Nome', 'Enviados'], [['Ação', 10]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Nome;Enviados\r\nAção;10');
  });

  it('escapa aspas, separador e quebra de linha', () => {
    expect(talkxCsvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(talkxCsvCell('a;b')).toBe('"a;b"');
    expect(talkxCsvCell('linha1\nlinha2')).toBe('"linha1\nlinha2"');
  });

  it.each(['=CMD()', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('grava %j como texto', (value) => {
    expect(talkxCsvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('nulos viram célula vazia', () => {
    expect(talkxCsvCell(null)).toBe('');
    expect(talkxCsvCell(undefined)).toBe('');
  });
});

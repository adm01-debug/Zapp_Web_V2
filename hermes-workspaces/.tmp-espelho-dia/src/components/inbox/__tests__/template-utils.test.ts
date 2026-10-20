import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AVAILABLE_VARIABLES,
  replaceVariables,
  extractVariables,
} from '../template-utils';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-06T09:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── AVAILABLE_VARIABLES ───────────────────────────────────────────────────────

describe('AVAILABLE_VARIABLES', () => {
  it('lista as 8 variáveis oferecidas ao usuário, sem chave repetida', () => {
    const keys = AVAILABLE_VARIABLES.map((v) => v.key);
    expect(keys).toEqual([
      'nome', 'primeiro_nome', 'empresa', 'cargo',
      'saudacao', 'data_atual', 'protocolo', 'atendente',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('toda variável tem rótulo, exemplo e ícone', () => {
    AVAILABLE_VARIABLES.forEach((v) => {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.example.length).toBeGreaterThan(0);
      expect(v.icon).toBeTruthy();
    });
  });
});

// ── replaceVariables ──────────────────────────────────────────────────────────

describe('replaceVariables — dados do contato', () => {
  it('troca {{nome}} e {{primeiro_nome}}', () => {
    const out = replaceVariables('Olá {{nome}}, bem-vindo {{primeiro_nome}}!', {
      name: 'João Silva',
    });
    expect(out).toBe('Olá João Silva, bem-vindo João!');
  });

  it('troca {{empresa}} e {{cargo}}', () => {
    const out = replaceVariables('{{empresa}} — {{cargo}}', {
      company: 'Tech Corp',
      job_title: 'Gerente Comercial',
    });
    expect(out).toBe('Tech Corp — Gerente Comercial');
  });

  it('sem contato, nome/empresa/cargo viram string vazia', () => {
    expect(replaceVariables('[{{nome}}][{{primeiro_nome}}][{{empresa}}][{{cargo}}]'))
      .toBe('[][][][]');
  });

  it('substitui TODAS as ocorrências da mesma variável', () => {
    const out = replaceVariables('{{nome}} e {{nome}}', { name: 'Ana' });
    expect(out).toBe('Ana e Ana');
  });

  it('é insensível a maiúsculas/minúsculas na variável', () => {
    expect(replaceVariables('{{Nome}}', { name: 'Ana' })).toBe('Ana');
    expect(replaceVariables('{{NOME}}', { name: 'Ana' })).toBe('Ana');
  });
});

describe('replaceVariables — valores padrão e customizados', () => {
  it('{{saudacao}} segue o horário da manhã', () => {
    vi.setSystemTime(new Date('2026-01-06T09:00:00'));
    expect(replaceVariables('{{saudacao}}')).toBe('Bom dia');
  });

  it('{{saudacao}} à tarde', () => {
    vi.setSystemTime(new Date('2026-01-06T14:00:00'));
    expect(replaceVariables('{{saudacao}}')).toBe('Boa tarde');
  });

  it('{{saudacao}} à noite', () => {
    vi.setSystemTime(new Date('2026-01-06T20:00:00'));
    expect(replaceVariables('{{saudacao}}')).toBe('Boa noite');
  });

  it('{{data_atual}} no formato pt-BR', () => {
    expect(replaceVariables('{{data_atual}}')).toBe('06/01/2026');
  });

  it('{{protocolo}} tem 13 dígitos precedidos de #', () => {
    expect(replaceVariables('{{protocolo}}')).toMatch(/^#\d{13}$/);
  });

  it('{{atendente}} cai no valor padrão', () => {
    expect(replaceVariables('Falou {{atendente}}')).toBe('Falou Atendente');
  });

  it('customValues sobrepõem os valores padrão', () => {
    const out = replaceVariables('{{atendente}}: {{nome}}', { name: 'Ana' }, {
      atendente: 'Maria',
    });
    expect(out).toBe('Maria: Ana');
  });

  it('variável desconhecida fica como estava no texto', () => {
    expect(replaceVariables('{{inexistente}} e {{nome}}', { name: 'Ana' }))
      .toBe('{{inexistente}} e Ana');
  });
});

// ── extractVariables ──────────────────────────────────────────────────────────

describe('extractVariables', () => {
  it('devolve array vazio sem variáveis', () => {
    expect(extractVariables('olá, tudo bem?')).toEqual([]);
  });

  it('extrai uma variável', () => {
    expect(extractVariables('Olá {{nome}}')).toEqual(['nome']);
  });

  it('extrai várias, sem repetir e em minúsculas', () => {
    expect(extractVariables('{{Nome}} {{empresa}} {{nome}}'))
      .toEqual(['nome', 'empresa']);
  });
});

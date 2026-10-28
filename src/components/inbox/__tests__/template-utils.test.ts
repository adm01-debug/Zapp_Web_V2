import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AVAILABLE_VARIABLES,
  replaceVariables,
  fillQuickReplyVariables,
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
  it('lista as 7 variáveis oferecidas ao usuário, sem chave repetida', () => {
    const keys = AVAILABLE_VARIABLES.map((v) => v.key);
    expect(keys).toEqual([
      'nome', 'primeiro_nome', 'empresa', 'cargo',
      'saudacao', 'data_atual', 'atendente',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('não oferece {{protocolo}}: não existe protocolo real e inventado é pior que nenhum', () => {
    expect(AVAILABLE_VARIABLES.some((v) => v.key === 'protocolo')).toBe(false);
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

describe('replaceVariables — texto do contato com $&, $$ e $1 não corrompe', () => {
  it('nome "A$&B" entra LITERAL (antes, $& virava o próprio {{nome}})', () => {
    expect(replaceVariables('Oi {{nome}}!', { name: 'A$&B' })).toBe('Oi A$&B!');
  });

  it('empresa com $$ e $1 entra literal', () => {
    expect(replaceVariables('{{empresa}}', { company: 'Cia $$ e $1' })).toBe('Cia $$ e $1');
  });

  it('cargo com $` e $\' entra literal', () => {
    expect(replaceVariables('{{cargo}}', { job_title: "$`x$'" })).toBe("$`x$'");
  });

  it('valor com $& não reintroduz a variável nem duplica o texto', () => {
    const out = replaceVariables('{{primeiro_nome}}', { name: '$&ana' });
    expect(out).toBe('$&ana');
    expect(out).not.toContain('{{');
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

  it('{{protocolo}} fica PENDENTE e o texto não muda entre chamadas (nada aleatório)', () => {
    const texto = 'Protocolo {{protocolo}} aberto';
    expect(replaceVariables(texto)).toBe(texto);
    expect(replaceVariables(texto)).toBe(replaceVariables(texto));
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

describe('replaceVariables — atendente real (agentName)', () => {
  it('sem agentName, {{atendente}} fica PENDENTE (nada de "Atendente" genérico)', () => {
    expect(replaceVariables('Falou {{atendente}}')).toBe('Falou {{atendente}}');
  });

  it('com agentName, {{atendente}} recebe o nome do atendente logado', () => {
    expect(replaceVariables('Falou {{atendente}}', undefined, undefined, 'Maria Santos'))
      .toBe('Falou Maria Santos');
  });

  it('agentName só com espaços não preenche (fica pendente)', () => {
    expect(replaceVariables('Falou {{atendente}}', undefined, undefined, '   '))
      .toBe('Falou {{atendente}}');
  });

  it('agentName convive com os dados do contato', () => {
    const out = replaceVariables('{{atendente}} fala com {{nome}}', { name: 'Ana' }, undefined, 'Maria');
    expect(out).toBe('Maria fala com Ana');
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

  it('detecta {{atendente}} e {{protocolo}} pendentes no texto', () => {
    expect(extractVariables('{{atendente}} — {{protocolo}}'))
      .toEqual(['atendente', 'protocolo']);
  });
});

describe('fillQuickReplyVariables — resposta rápida inserida no chat', () => {
  it('troca as variáveis pelos dados do contato e do atendente', () => {
    const texto = fillQuickReplyVariables(
      'Olá {{primeiro_nome}}, da {{empresa}} ({{cargo}}). Aqui é {{atendente}}.',
      { name: 'Maria Souza', company: 'Acme', job_title: 'Compras' },
      'Joaquim',
    );
    expect(texto).toBe('Olá Maria, da Acme (Compras). Aqui é Joaquim.');
  });

  it('e-mail não vira nome do atendente: {{atendente}} fica pendente', () => {
    expect(fillQuickReplyVariables('Sou {{atendente}}', { name: 'Ana' }, 'x@y.com')).toBe('Sou {{atendente}}');
    expect(fillQuickReplyVariables('Sou {{atendente}}', { name: 'Ana' }, null)).toBe('Sou {{atendente}}');
  });

  it('campos nulos do contato não viram "null" no texto', () => {
    expect(fillQuickReplyVariables('[{{empresa}}]', { name: 'Ana', company: null, job_title: null }, 'Bia')).toBe('[]');
  });

  it('texto sem variável sai igual', () => {
    expect(fillQuickReplyVariables('Obrigado!', { name: 'Ana' }, 'Bia')).toBe('Obrigado!');
  });
});

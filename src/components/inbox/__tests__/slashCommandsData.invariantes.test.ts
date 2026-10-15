/**
 * U7 (paridade V3→V2, doc 11) — `slashCommandsData` não tinha teste de invariantes
 * na V2 (a V3 tinha `slash-commands/__tests__/slashCommandsData`, 25 casos; 22 sem par).
 *
 * Invariantes que o dado tem de cumprir: ids e comandos únicos, atalhos únicos de uma
 * letra, sub-comandos de transfer/priority/snooze e categorias dentro do conjunto da UI.
 * O esperado vem do CONTRATO (unicidade, forma), não de uma cópia da lista.
 */
import { describe, it, expect } from 'vitest';
import { SLASH_COMMANDS, categoryColors, categoryLabels } from '../slash-commands/slashCommandsData';

const CATEGORIAS_UI = ['actions', 'templates', 'notes', 'tags', 'priority'];

describe('slashCommandsData — invariantes (U7)', () => {
  it('todo comando começa com "/" e tem id, label e descrição não vazios', () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
    for (const c of SLASH_COMMANDS) {
      expect(c.id).toBeTruthy();
      expect(c.label.trim()).not.toBe('');
      expect(c.description.trim()).not.toBe('');
      expect(c.command.startsWith('/')).toBe(true);
    }
  });

  it('ids são únicos', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('comandos são únicos', () => {
    const comandos = SLASH_COMMANDS.map((c) => c.command);
    expect(new Set(comandos).size).toBe(comandos.length);
  });

  it('atalhos são únicos e de uma letra só', () => {
    const atalhos = SLASH_COMMANDS.map((c) => c.shortcut).filter((s): s is string => !!s);
    expect(atalhos.length).toBe(SLASH_COMMANDS.length);
    for (const s of atalhos) expect(s).toMatch(/^[A-Za-z]$/);
    expect(new Set(atalhos.map((s) => s.toUpperCase())).size).toBe(atalhos.length);
  });

  it('cada comando pertence a uma categoria conhecida', () => {
    for (const c of SLASH_COMMANDS) expect(CATEGORIAS_UI).toContain(c.category);
  });

  it('/transfer oferece os sub-comandos de agente e fila', () => {
    const transfer = SLASH_COMMANDS.find((c) => c.command === '/transfer');
    expect(transfer?.subCommands?.map((s) => s.value)).toEqual(['agent', 'queue']);
  });

  it('/priority oferece alta, média e baixa', () => {
    const priority = SLASH_COMMANDS.find((c) => c.command === '/priority');
    expect(priority?.subCommands?.map((s) => s.value)).toEqual(['high', 'medium', 'low']);
  });

  it('/snooze oferece 1h, 3h, amanhã e próxima semana', () => {
    const snooze = SLASH_COMMANDS.find((c) => c.command === '/snooze');
    expect(snooze?.subCommands?.map((s) => s.value)).toEqual(['1h', '3h', 'tomorrow', 'nextweek']);
  });

  it('sub-comandos, quando existem, têm id e value únicos dentro do comando', () => {
    for (const c of SLASH_COMMANDS) {
      if (!c.subCommands) continue;
      const values = c.subCommands.map((s) => s.value);
      const ids = c.subCommands.map((s) => s.id);
      expect(new Set(values).size).toBe(values.length);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('toda categoria usada tem cor e rótulo na UI', () => {
    const usadas = Array.from(new Set(SLASH_COMMANDS.map((c) => c.category)));
    for (const cat of usadas) {
      expect(categoryColors[cat]).toBeTruthy();
      expect(categoryLabels[cat]).toBeTruthy();
    }
  });
});

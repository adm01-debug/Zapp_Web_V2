import { describe, it, expect } from 'vitest';
import { detectReminderIntent } from '../detectReminderIntent';

/** Data de referência: quarta-feira, 26/11/2025, 10h. */
const QUARTA = new Date(2025, 10, 26, 10, 0, 0, 0);

describe('detectReminderIntent', () => {
  it('reconhece "me liga na quinta" e resolve a próxima quinta, não hoje', () => {
    const r = detectReminderIntent('me liga na quinta', QUARTA);
    expect(r).not.toBeNull();
    // 2025-11-27 é quinta-feira.
    expect(new Date(r!.remindAt).getDay()).toBe(4);
    expect(new Date(r!.remindAt).getDate()).toBe(27);
    expect(r!.matchedText).toContain('quinta');
  });

  it('quinta dita numa quinta cai na semana seguinte (7 dias, não hoje)', () => {
    const quinta = new Date(2025, 10, 27, 10, 0, 0, 0);
    const r = detectReminderIntent('me liga na quinta', quinta);
    expect(new Date(r!.remindAt).getDate()).toBe(4); // 04/12
  });

  it('casa dia da semana com acento e "-feira"', () => {
    const r = detectReminderIntent('pode ser sexta-feira?', QUARTA);
    expect(r).not.toBeNull();
    expect(new Date(r!.remindAt).getDay()).toBe(5);
  });

  it('usa o horário explícito quando o cliente informa', () => {
    const r = detectReminderIntent('me liga amanhã às 14:30', QUARTA);
    expect(r).not.toBeNull();
    const d = new Date(r!.remindAt);
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('"amanhã" sem hora cai no horário padrão de 9h', () => {
    const r = detectReminderIntent('te retorno amanhã', QUARTA);
    const d = new Date(r!.remindAt);
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(9);
  });

  it('"hoje" com horário já passado é empurrado para amanhã', () => {
    const tarde = new Date(2025, 10, 26, 18, 0, 0, 0);
    const r = detectReminderIntent('me liga hoje', tarde);
    const d = new Date(r!.remindAt);
    expect(d.getDate()).toBe(27);
  });

  it('reconhece data numérica dd/mm', () => {
    const r = detectReminderIntent('fechamos dia 25/12', QUARTA);
    const d = new Date(r!.remindAt);
    expect(d.getDate()).toBe(25);
    expect(d.getMonth()).toBe(11);
  });

  it('data sem ano que já passou vira o ano seguinte', () => {
    const dezembro = new Date(2025, 11, 20, 10, 0, 0, 0);
    const r = detectReminderIntent('dia 05/01', dezembro);
    expect(new Date(r!.remindAt).getFullYear()).toBe(2026);
  });

  it('verbo de contato sem data oferece amanhã 9h', () => {
    const r = detectReminderIntent('me chama depois', QUARTA);
    expect(r).not.toBeNull();
    const d = new Date(r!.remindAt);
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(9);
  });

  it('devolve null quando não há data nem pedido de contato', () => {
    expect(detectReminderIntent('qual o preço da caneca?', QUARTA)).toBeNull();
    expect(detectReminderIntent('', QUARTA)).toBeNull();
    expect(detectReminderIntent('   ', QUARTA)).toBeNull();
  });
});
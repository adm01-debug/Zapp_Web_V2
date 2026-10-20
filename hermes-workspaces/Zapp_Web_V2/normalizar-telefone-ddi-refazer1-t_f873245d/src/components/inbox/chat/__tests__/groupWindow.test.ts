/**
 * Agrupamento por janela de tempo — unidade pura.
 *
 * Paridade com a V3: mensagens do mesmo remetente so continuam no MESMO grupo
 * visual enquanto a distancia entre elas couber em 5 min; passou disso, comecou
 * um novo cabecalho de grupo (avatar + nome de novo). Virada de dia quebra o
 * grupo mesmo dentro dos 5 min, e timestamp invalido nunca agrupa.
 */
import { describe, it, expect } from 'vitest';
import { agrupaComJanela, JANELA_AGRUPAMENTO_MS } from '../groupWindow';

const T = (iso: string) => new Date(iso);

describe('agrupaComJanela', () => {
  it('agrupa mesmo remetente dentro da janela de 5 min', () => {
    const prev = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const atual = { sender: 'contact', timestamp: T('2026-10-12T12:04:59Z') };
    expect(agrupaComJanela(prev, atual)).toBe(true);
  });

  it('agrupa exatamente no limite da janela (inclusivo)', () => {
    const prev = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const atual = { sender: 'contact', timestamp: new Date(T('2026-10-12T12:00:00Z').getTime() + JANELA_AGRUPAMENTO_MS) };
    expect(agrupaComJanela(prev, atual)).toBe(true);
  });

  it('quebra o grupo 1 ms depois da janela', () => {
    const prev = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const atual = { sender: 'contact', timestamp: new Date(T('2026-10-12T12:00:00Z').getTime() + JANELA_AGRUPAMENTO_MS + 1) };
    expect(agrupaComJanela(prev, atual)).toBe(false);
  });

  it('quebra o grupo quando o remetente muda', () => {
    const prev = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const atual = { sender: 'agent', timestamp: T('2026-10-12T12:00:30Z') };
    expect(agrupaComJanela(prev, atual)).toBe(false);
  });

  it('quebra o grupo na virada de dia, mesmo dentro dos 5 min', () => {
    // Datas no fuso local (isSameDay e dia do calendario local, igual ao
    // separador de data da tela).
    const prev = { sender: 'contact', timestamp: new Date('2026-10-12T23:58:00') };
    const atual = { sender: 'contact', timestamp: new Date('2026-10-13T00:02:00') };
    expect(agrupaComJanela(prev, atual)).toBe(false);
  });

  it('nunca agrupa quando falta uma das mensagens', () => {
    const msg = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    expect(agrupaComJanela(undefined, msg)).toBe(false);
    expect(agrupaComJanela(msg, undefined)).toBe(false);
  });

  it('nunca agrupa com timestamp invalido (null ou Invalid Date)', () => {
    const valido = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const semData = { sender: 'contact', timestamp: null };
    const dataInvalida = { sender: 'contact', timestamp: new Date('nao e data') };
    expect(agrupaComJanela(valido, semData)).toBe(false);
    expect(agrupaComJanela(valido, dataInvalida)).toBe(false);
    expect(agrupaComJanela(dataInvalida, valido)).toBe(false);
  });

  it('respeita janela customizada', () => {
    const prev = { sender: 'contact', timestamp: T('2026-10-12T12:00:00Z') };
    const atual = { sender: 'contact', timestamp: T('2026-10-12T12:00:30Z') };
    expect(agrupaComJanela(prev, atual, 30_000)).toBe(true);
    expect(agrupaComJanela(prev, atual, 10_000)).toBe(false);
  });
});

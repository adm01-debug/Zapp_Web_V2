/**
 * Comportamento de `src/lib/formatters.ts` — o texto que o operador lê (pt-BR, fuso local).
 * `formatBirthday` tem arquivo próprio (`formatBirthday.test.ts`) e não é repetido aqui.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanPhone,
  formatBrazilianPhone,
  formatBRL,
  formatCompactNumber,
  formatDuration,
  formatFullDateTime,
  formatPercentage,
  formatRelativeTime,
  formatShortDate,
  formatSmartDate,
  getInitials,
  truncate,
} from '../formatters';

/** O Intl separa "R$"/"mil" do número com NBSP (U+00A0); o usuário lê espaço. */
const semNbsp = (texto: string) => texto.replace(/\u00A0/g, ' ');

const NOW = new Date(2026, 9, 7, 15, 0, 0); // 07/10/2026 15:00 no fuso local

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('usa o sufixo e o locale pt-BR em minutos', () => {
    expect(formatRelativeTime(new Date(2026, 9, 7, 14, 30, 0))).toBe('há 30 minutos');
  });

  it('aceita string ISO e epoch (número)', () => {
    expect(formatRelativeTime('2026-10-05T15:00:00')).toBe('há 2 dias');
    expect(formatRelativeTime(NOW.getTime() - 30 * 60 * 1000)).toBe('há 30 minutos');
  });
});

describe('formatSmartDate', () => {
  it('hoje mostra "Hoje" com a hora', () => {
    expect(formatSmartDate(new Date(2026, 9, 7, 9, 5))).toBe('Hoje, 09:05');
  });

  it('ontem mostra "Ontem" com a hora', () => {
    expect(formatSmartDate(new Date(2026, 9, 6, 23, 59))).toBe('Ontem, 23:59');
  });

  it('antes de ontem mostra a data completa', () => {
    expect(formatSmartDate(new Date(2026, 9, 5, 14, 30))).toBe('05/10/2026 às 14:30');
  });

  it('aceita string sem fuso (hora local, não UTC)', () => {
    expect(formatSmartDate('2026-10-07T23:30:00')).toBe('Hoje, 23:30');
  });
});

describe('formatShortDate / formatFullDateTime', () => {
  it('formata dd/MM/yyyy a partir de Date e de string local', () => {
    expect(formatShortDate(new Date(2026, 0, 3))).toBe('03/01/2026');
    expect(formatShortDate('2026-10-07T12:00:00')).toBe('07/10/2026');
  });

  it('formata data e hora com segundos', () => {
    expect(formatFullDateTime(new Date(2026, 9, 5, 14, 30, 7))).toBe('05/10/2026 às 14:30:07');
  });
});

describe('cleanPhone / formatBrazilianPhone', () => {
  it('deixa só os dígitos', () => {
    expect(cleanPhone('+55 (11) 99999-9999')).toBe('5511999999999');
    expect(cleanPhone('sem número')).toBe('');
  });

  it.each([
    ['celular com DDI', '+55 (11) 99999-9999', '(11) 99999-9999'],
    ['celular sem DDI', '11999999999', '(11) 99999-9999'],
    ['fixo com DDI', '551133334444', '(11) 3333-4444'],
    ['fixo sem DDI', '11 3333-4444', '(11) 3333-4444'],
    ['fixo com 10 dígitos, sem DDD', '9999999999', '(99) 9999-9999'],
  ])('%s: %s → %s', (_caso, entrada, esperado) => {
    expect(formatBrazilianPhone(entrada)).toBe(esperado);
  });

  it('devolve a entrada original quando não reconhece o tamanho', () => {
    expect(formatBrazilianPhone('1199')).toBe('1199');
    expect(formatBrazilianPhone('')).toBe('');
  });
});

describe('formatBRL', () => {
  it('usa o formato de moeda pt-BR com milhar e centavos', () => {
    expect(semNbsp(formatBRL(1234.56))).toBe('R$ 1.234,56');
    expect(semNbsp(formatBRL(0))).toBe('R$ 0,00');
    expect(semNbsp(formatBRL(-12.5))).toBe('-R$ 12,50');
  });
});

describe('truncate / getInitials', () => {
  it('corta no limite e acrescenta reticências', () => {
    expect(truncate('abcdefgh', 4)).toBe('abcd…');
    expect(truncate('abcde fgh', 6)).toBe('abcde…');
  });

  it('não mexe no texto que cabe exatamente', () => {
    expect(truncate('abcdef', 6)).toBe('abcdef');
  });

  it('usa as iniciais das palavras, ignorando espaço repetido', () => {
    expect(getInitials('João Silva')).toBe('JS');
    expect(getInitials('  maria   clara souza ')).toBe('MC');
    expect(getInitials('joão pedro silva', 3)).toBe('JPS');
    expect(getInitials('   ')).toBe('');
  });
});

describe('formatCompactNumber', () => {
  it('usa a notação compacta em pt-BR', () => {
    expect(semNbsp(formatCompactNumber(1500))).toBe('1,5 mil');
    expect(semNbsp(formatCompactNumber(2500000))).toBe('2,5 mi');
  });

  it('mantém o número inteiro abaixo de mil', () => {
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(0)).toBe('0');
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45s'],
    [59, '59s'],
    [60, '1min'],
    [125, '2min 5s'],
    [120, '2min'],
    [3600, '1h'],
    [3725, '1h 2min'],
    [5400, '1h 30min'],
    [3599, '59min 59s'],
  ])('%d s → %s', (segundos, esperado) => {
    expect(formatDuration(segundos)).toBe(esperado);
  });

  it.fails('59,6 s não deveria ser exibido como "60s"', () => {
    // O ramo `seconds < 60` arredonda antes de responder: 59,6 vira "60s", texto
    // que não existe na escala. Mesmo defeito em 3599,7 → "59min 60s".
    expect(formatDuration(59.6)).toBe('1min');
  });

  it.fails('3599,7 s não deveria ser exibido como "59min 60s"', () => {
    expect(formatDuration(3599.7)).toBe('1h');
  });
});

describe('formatPercentage', () => {
  it('converte fração em porcentagem com uma casa', () => {
    expect(formatPercentage(0.856)).toBe('85.6%');
  });

  it('respeita o número de casas pedido', () => {
    expect(formatPercentage(0.856, 0)).toBe('86%');
    expect(formatPercentage(0.5, 2)).toBe('50.00%');
  });
});

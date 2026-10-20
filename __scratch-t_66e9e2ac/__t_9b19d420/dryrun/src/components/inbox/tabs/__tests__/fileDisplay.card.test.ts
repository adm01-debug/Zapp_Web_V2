import { describe, it, expect } from 'vitest';
import { cardName, formatCardDate, typeSizeLine } from '../fileDisplay';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * Etapas S22–S26 (cartão R03): texto do cartão de arquivo. As três funções novas NÃO
 * substituem as antigas (`formatMeta`, `formatSize`, `formatFileDate`) — os testes delas
 * seguem em `fileDisplay.test.ts`, intactos.
 *
 * Fuso: nenhuma asserção pina um fuso. As datas são construídas no fuso LOCAL do
 * navegador (`new Date(ano, mês, dia, h, min)`) e o esperado é derivado do mesmo fuso,
 * então o teste vale em UTC-3 e em UTC. Onde o fuso importa, o caso é montado para
 * discriminar dia LOCAL de dia UTC (ver "decide Hoje/Ontem pelo dia LOCAL").
 */

/** Data no fuso local do navegador do teste (mês 1–12, como se lê). */
function local(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const pad = (value: number) => String(value).padStart(2, '0');
const hhmm = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Item do cartão — o padrão é um arquivo humano de 2,4 MB (como no mockup). */
function item(over: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'm1',
    url: 'https://x/abridor-madeira.jpg',
    type: 'image',
    filename: 'abridor-madeira.jpg',
    displayName: 'abridor-madeira.jpg',
    extension: 'jpg',
    senderLabel: 'Atendente',
    created_at: local(2026, 9, 2, 18, 45).toISOString(),
    caption: null,
    mimetype: 'image/jpeg',
    size: 2516583, // 2,4 MB exatos (2,4 * 1024 * 1024, arredondado)
    meta: null,
    sender: 'agent',
    ...over,
  };
}

const NOME_TECNICO = '3EB0E6947FC0A0ECAED14D_1790283276022.jpg';

describe('formatCardDate (S22) — data curta do cartão', () => {
  it('mesmo dia local vira "Hoje, HH:mm"', () => {
    expect(formatCardDate(local(2026, 9, 2, 16, 10).toISOString(), local(2026, 9, 2, 20, 0))).toBe(
      'Hoje, 16:10',
    );
  });

  it('dia anterior vira "Ontem, HH:mm"', () => {
    expect(formatCardDate(local(2026, 9, 2, 14, 32).toISOString(), local(2026, 9, 3, 9, 0))).toBe(
      'Ontem, 14:32',
    );
  });

  it('virada de dia 23:59 → 00:01: a mensagem das 23:59 vira "Ontem"', () => {
    expect(
      formatCardDate(local(2026, 9, 2, 23, 59).toISOString(), local(2026, 9, 3, 0, 1)),
    ).toBe('Ontem, 23:59');
    expect(
      formatCardDate(local(2026, 9, 3, 0, 1).toISOString(), local(2026, 9, 3, 0, 2)),
    ).toBe('Hoje, 00:01');
  });

  it('data antiga sai "dd mês-abreviado ano, HH:mm" em português, minúsculo e sem ponto', () => {
    expect(
      formatCardDate(local(2026, 9, 2, 18, 45).toISOString(), local(2026, 9, 7, 10, 0)),
    ).toBe('02 set 2026, 18:45');
    expect(
      formatCardDate(local(2026, 3, 8, 7, 5).toISOString(), local(2026, 3, 20, 10, 0)),
    ).toBe('08 mar 2026, 07:05');
    expect(
      formatCardDate(local(2026, 12, 25, 22, 0).toISOString(), local(2026, 12, 31, 10, 0)),
    ).toBe('25 dez 2026, 22:00');
  });

  it('ano diferente aparece na data antiga', () => {
    expect(
      formatCardDate(local(2025, 9, 2, 18, 45).toISOString(), local(2026, 9, 7, 10, 0)),
    ).toBe('02 set 2025, 18:45');
  });

  it('"Ontem" atravessa virada de mês e de ano', () => {
    expect(
      formatCardDate(local(2026, 12, 31, 23, 59).toISOString(), local(2027, 1, 1, 0, 5)),
    ).toBe('Ontem, 23:59');
    expect(
      formatCardDate(local(2026, 3, 1, 9, 5).toISOString(), local(2026, 3, 2, 8, 0)),
    ).toBe('Ontem, 09:05');
  });

  it('decide Hoje/Ontem pelo dia LOCAL, e não pelo dia em UTC', () => {
    // Em UTC-3, 02/09 23:30 local ainda é 03/09 em UTC: comparar por dia UTC diria "Hoje".
    const agora = local(2026, 9, 3, 0, 15);
    const antes = local(2026, 9, 2, 23, 30);
    expect(formatCardDate(antes.toISOString(), agora)).toBe('Ontem, 23:30');
  });

  it('usa a hora do fuso do navegador (o mesmo getHours()), não a de UTC', () => {
    const iso = '2026-09-02T21:45:00.000Z';
    const localDate = new Date(iso);
    const agora = new Date(localDate.getTime() + 5 * 60_000);
    expect(formatCardDate(iso, agora)).toBe(`Hoje, ${hhmm(localDate)}`);
  });

  it('data inválida devolve string vazia (nunca "Invalid Date")', () => {
    expect(formatCardDate('', new Date())).toBe('');
    expect(formatCardDate('não é uma data', new Date())).toBe('');
    expect(formatCardDate('29/02/2026', new Date())).toBe('');
  });
});

describe('typeSizeLine (S23/S25) — linha "Tipo · tamanho"', () => {
  it('junta tipo e tamanho com a vírgula decimal do mockup', () => {
    expect(typeSizeLine(item())).toBe('Imagem · 2,4 MB');
    expect(typeSizeLine(item({ type: 'video', size: 5242880 }))).toBe('Vídeo · 5,0 MB');
  });

  it('sem tamanho sobra só o tipo — nunca "0 KB" nem separador solto', () => {
    expect(typeSizeLine(item({ type: 'audio', size: null }))).toBe('Áudio');
    expect(typeSizeLine(item({ type: 'document', size: 0 }))).toBe('Documento');
    expect(typeSizeLine(item({ type: 'document', size: null }))).not.toMatch(/·|null|KB/);
  });

  it('tamanho em B e KB sai como o formatSize (só o separador decimal muda)', () => {
    expect(typeSizeLine(item({ type: 'document', size: 512 }))).toBe('Documento · 512 B');
    expect(typeSizeLine(item({ type: 'document', size: 2048 }))).toBe('Documento · 2 KB');
    expect(typeSizeLine(item({ type: 'image', size: 1024 }))).toBe('Imagem · 1 KB');
  });

  it('valor de GB não quebra a linha: o formatSize (congelado) segue em MB', () => {
    // formatSize não tem faixa de GB e o cartão proíbe mudá-lo: 3 GiB = 3072,0 MB.
    expect(typeSizeLine(item({ type: 'video', size: 3221225472 }))).toBe('Vídeo · 3072,0 MB');
  });

  it('tipo vem do mapa TYPE_LABEL dos quatro tipos', () => {
    const tipos: ContactMediaItem['type'][] = ['image', 'video', 'audio', 'document'];
    expect(tipos.map((type) => typeSizeLine(item({ type, size: null })))).toEqual([
      'Imagem',
      'Vídeo',
      'Áudio',
      'Documento',
    ]);
  });
});

describe('cardName (S24/D09) — nome do cartão', () => {
  it('nome humano vai em destaque e não é técnico', () => {
    expect(cardName(item({ filename: 'planilha-total.xlsx', displayName: 'planilha-total.xlsx' })))
      .toEqual({ text: 'planilha-total.xlsx', isTechnical: false });
    expect(cardName(item({ filename: NOME_TECNICO, displayName: 'abridor.jpg', extension: 'png' }))
      .text).toBe('abridor.jpg');
  });

  it('nome técnico (hex do WhatsApp) marca isTechnical e o text continua o displayName', () => {
    const com = cardName(
      item({ filename: NOME_TECNICO, extension: 'jpg', displayName: 'Imagem · 25/09 09:40' }),
    );
    expect(com).toEqual({ text: 'Imagem · 25/09 09:40', isTechnical: true });
  });

  it('sem nome algum não há nome técnico para mostrar na dica', () => {
    expect(cardName(item({ filename: '', displayName: 'Áudio · 25/09 09:40', extension: 'ogg' })))
      .toEqual({ text: 'Áudio · 25/09 09:40', isTechnical: false });
  });

  it('nome humano com espaços nas bordas não vira técnico', () => {
    expect(cardName(item({ filename: '  contrato.pdf  ', displayName: 'contrato.pdf' })))
      .toEqual({ text: 'contrato.pdf', isTechnical: false });
  });

  it('não recalcula o nome: devolve o displayName que o item já traz', () => {
    const texto = cardName(item({ displayName: 'Nome que o item mandou' })).text;
    expect(texto).toBe('Nome que o item mandou');
  });
});

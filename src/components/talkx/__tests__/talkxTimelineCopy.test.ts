import { describe, it, expect } from 'vitest';
import {
  describeLimitsChange, describeTimelineEvent, timelineKindLabel, timelineKindOptions,
} from '../tracking/talkxTimelineCopy';
import type { TalkXEventType } from '@/hooks/integrations/useTalkXEvents';
import type { TalkXTimelineItem } from '@/hooks/integrations/useTalkXCampaignTimeline';

/**
 * X152 — mapa tipo → título/ícone/cor/frase da "Linha do tempo operacional".
 *
 * O defeito que este teste trava: o Monitor escrevia o TIPO CRU do banco quando o
 * evento não tinha mensagem (a palavra "resumed" na tela) e mostrava o JSON de
 * `limits_updated` (`{"before":{...}}`) para o operador.
 */

const item = (over: Partial<TalkXTimelineItem>): TalkXTimelineItem => ({
  id: 'ev-1',
  kind: 'note',
  at: '2026-10-08T12:00:00.000Z',
  actorName: null,
  message: null,
  contactName: null,
  contactPhone: null,
  ...over,
});

/** União `TalkXEventType` declarada em useTalkXEvents.ts (UE:5-11). */
const TIPOS_DA_UNIAO: TalkXEventType[] = [
  'created', 'updated', 'scheduled', 'started', 'paused', 'resumed', 'cancelled', 'completed', 'note',
  'scheduled_updated', 'limits_updated', 'connection_failed', 'resumed_auto', 'skipped_suppressed',
  'suppression_add', 'suppression_remove', 'suppression_update', 'segments_reviewed', 'checklist',
];

/**
 * Tipos que o CHECK vivo de `talkx_campaign_events` aceita além da união do front
 * (20260929730000 = 19 tipos; 20261002691230 / X021 acrescentou estes 8). O servidor
 * grava e a timeline mostra — nenhum deles pode cair no título genérico.
 */
const TIPOS_ACEITOS_PELO_BANCO_ALEM_DA_UNIAO = [
  'link_created', 'link_updated', 'link_deleted', 'investment_updated',
  'report_exported', 'report_shared', 'import_created', 'import_completed',
];

const TITULO_GENERICO = 'Atualização da campanha';

describe('talkxTimelineCopy — todo tipo do servidor tem título em português (X152)', () => {
  it('cada tipo da união TalkXEventType tem título (nunca cai no genérico)', () => {
    for (const tipo of TIPOS_DA_UNIAO) {
      const label = timelineKindLabel(tipo);
      expect(label, `tipo sem título: ${tipo}`).not.toBe(TITULO_GENERICO);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('cada tipo que o CHECK do banco aceita (X021 incluído) tem título', () => {
    for (const tipo of TIPOS_ACEITOS_PELO_BANCO_ALEM_DA_UNIAO) {
      const label = timelineKindLabel(tipo);
      expect(label, `tipo sem título: ${tipo}`).not.toBe(TITULO_GENERICO);
    }
  });

  it('o mapa tem uma opção de filtro por tipo, em ordem alfabética, sem repetir valor', () => {
    const options = timelineKindOptions();
    expect(options.length).toBe(TIPOS_DA_UNIAO.length + TIPOS_ACEITOS_PELO_BANCO_ALEM_DA_UNIAO.length);
    const labels = options.map((o) => o.label);
    expect([...labels].sort((a, b) => a.localeCompare(b, 'pt-BR'))).toEqual(labels);
    expect(new Set(options.map((o) => o.value)).size).toBe(options.length);
  });
});

describe('talkxTimelineCopy — frase de cada evento (X152)', () => {
  it('`resumed` com ator: "Retomada após pausa" e o nome — nunca a palavra "resumed"', () => {
    const description = describeTimelineEvent(item({ kind: 'resumed', actorName: 'Ana Souza' }));
    expect(description.title).toBe('Retomada após pausa');
    expect(description.phrase).toBe('Retomada após pausa — por Ana Souza');
    expect(description.phrase).not.toContain('resumed');
  });

  it('`resumed_auto` (sem ator) fica só com o próprio texto', () => {
    const description = describeTimelineEvent(item({ kind: 'resumed_auto' }));
    expect(description.phrase).toBe('Retomada automática');
  });

  it('`limits_updated` mostra os valores formatados e NENHUMA chave do JSON', () => {
    const message = JSON.stringify({
      before: { max_per_minute: 30, business_hours_only: false, speed_profile: 'normal' },
      after: { max_per_minute: 60, business_hours_only: true, speed_profile: 'normal' },
    });
    const description = describeTimelineEvent(item({ kind: 'limits_updated', message }));
    expect(description.detail).toBe('Limite por minuto: 30 → 60 · Só horário comercial: Não → Sim');
    expect(description.phrase).not.toContain('{');
    expect(description.phrase).not.toContain('before');
    expect(description.phrase).not.toContain('after');
    expect(description.phrase).not.toContain('max_per_minute');
  });

  it('`limits_updated` sem diferença legível (ou com JSON quebrado) fica só com o título', () => {
    const igual = describeTimelineEvent(item({
      kind: 'limits_updated',
      message: JSON.stringify({ before: { max_per_minute: 30 }, after: { max_per_minute: 30 } }),
    }));
    expect(igual.phrase).toBe('Limites alterados');
    expect(describeLimitsChange('{"before":')).toBeNull();
  });

  it('`paused` com motivo escreve "Motivo: ..." e o autor', () => {
    const description = describeTimelineEvent(item({ kind: 'paused', message: 'janela de envio fechada', actorName: 'Ana' }));
    expect(description.phrase).toBe('Campanha pausada — Motivo: janela de envio fechada · por Ana');
  });

  it('tipo desconhecido não vira o tipo cru na tela', () => {
    const description = describeTimelineEvent(item({ kind: 'tipo_novo_do_servidor' }));
    expect(description.title).toBe(TITULO_GENERICO);
    expect(description.phrase).not.toContain('tipo_novo_do_servidor');
  });

  it('mensagem que é JSON nunca vai para a tela, nem em evento de texto livre', () => {
    const description = describeTimelineEvent(item({ kind: 'note', message: '{"campo":"valor"}' }));
    expect(description.detail).toBeNull();
    expect(description.phrase).toBe('Observação');
  });

  it('investimento vem do servidor como número e aparece em reais', () => {
    const description = describeTimelineEvent(item({ kind: 'investment_updated', message: '1500.00' }));
    expect(description.detail).toContain('1.500,00');
  });
});

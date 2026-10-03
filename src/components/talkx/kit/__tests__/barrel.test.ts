import { describe, expect, it } from 'vitest';

import * as talkxShared from '../../talkxShared';

/**
 * X042 — lista fixa dos símbolos exportados em runtime (constantes, funções e
 * componentes) que os importadores do módulo consomem hoje via `talkxShared`.
 *
 * Se um símbolo sumir do barrel (ou seja renomeado/movido sem re-export), este
 * teste falha. Tipos (`PillTone`, `TileColor`, …) não aparecem em runtime e são
 * cobertos pelo `tsc`; a lista aqui é só o que o JavaScript enxerga.
 */
const EXPORTED_NAMES = [
  'StateShell',
  'TalkXCrmUnavailableState',
  'TalkXFilteredEmptyState',
  'WhatsAppLogo',
  'TalkXFilterBar',
  'TalkXNoData',
  'CAMPAIGN_STATUS',
  'RECIPIENT_STATUS',
  'OBJECTIVES',
  'SPEED_PROFILES',
  'SUPPRESSION_ORIGIN',
  'TEMPLATE_CATEGORIES',
  'TEMPLATE_STATUS',
  'VARIABLE_KEYS',
  'fmtInt',
  'fmtPct',
  'pct',
  'fmtDateTime',
  'fmtDate',
  'fmtTime',
  'fmtAgo',
  'extractVariables',
  'estimateSeconds',
  'fmtDurationShort',
  'barsByDay',
  'personalizePreview',
  'IconTile',
  'ModuleHeader',
  'MetaRow',
  'Th',
  'Td',
  'StatusPill',
  'SegmentedToggle',
  'TalkXPrimaryButton',
  'AlertCard',
  'WhatsAppBubble',
  'PhoneFrame',
  'FilterBarV2',
  'TalkXPagination',
  'RowActionsMenu',
  'TalkXTable',
  'TalkXEmptyState',
  'TalkXErrorState',
  'TalkXDataUnavailableState',
  'TalkXWhatsAppDisconnectedState',
  'TalkXNoPermissionState',
  'TalkXSkeletonRows',
  'KpiCard',
  'KpiCardSkeleton',
  'RailCard',
  'RailAction',
  'HeroCard',
  'RecentList',
  'TipCard',
  'TalkXConfirmDialog',
  'InsightCard',
  'EntityCell',
  'ProgressCell',
  'ResultsCell',
  'ChannelCell',
  'DateByCell',
  'TalkXBulkBar',
  'fmtRelativeDay',] as const;

describe('talkxShared (barrel do kit X042)', () => {
  it('exporta exatamente os símbolos de hoje, sem perder nem inventar nenhum', () => {
    const atual = Object.keys(talkxShared).sort();
    expect(atual).toEqual([...EXPORTED_NAMES].sort());
  });

  it('mantém cada símbolo esperado presente no barrel', () => {
    for (const nome of EXPORTED_NAMES) {
      expect(talkxShared).toHaveProperty(nome);
    }
  });
});

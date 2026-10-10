/**
 * Testa a exportação com auditoria do histórico de envios.
 *
 * Prova que `exportSendHistoryCsv` registra no log de auditoria
 * quem exportou, com filtro e número de linhas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAudit } from '@/lib/audit';
import {
  exportSendHistoryCsv,
  buildSendHistoryCsv,
  sendHistoryFilename,
  type CatalogSendHistoryRow,
} from '../useCatalogSendHistory';

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const row: CatalogSendHistoryRow = {
  id: 'sh-1',
  product_id: 'p1',
  product_name: 'Caneta Bambu',
  product_sku: 'CB-1',
  variant_label: null,
  contact_id: 'c1',
  contact_name: 'João',
  agent_id: 'a1',
  agent_name: 'Maria',
  template: 'boas_vindas',
  images_count: 2,
  status: 'sent',
  created_at: '2026-10-10T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('exportSendHistoryCsv — auditoria', () => {
  it('registra no log de auditoria quem exportou, com filtro e número de linhas', () => {
    const download = vi.fn(() => true);

    const result = exportSendHistoryCsv([row, row], {
      filterKey: 'contact_123',
      filters: { contactId: '123' },
      date: new Date(2026, 9, 1),
      download,
    });

    expect(result).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    const [csv, filename] = download.mock.calls[0] as unknown as [string, string];
    expect(filename).toBe('catalogo_enviados_20261001.csv');
    expect(csv).toBe(buildSendHistoryCsv([row, row]));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog_send_history_export',
        entityType: 'catalog_send_history_export',
        entityId: 'catalogo_enviados_20261001.csv',
        details: expect.objectContaining({
          filter: 'contact_123',
          filters: { contactId: '123' },
          rows: 2,
        }),
      }),
    );
  });

  it('não registra auditoria quando o download é bloqueado', () => {
    const download = vi.fn(() => false);

    const result = exportSendHistoryCsv([row], {
      filterKey: 'todos',
      date: new Date(2026, 9, 1),
      download,
    });

    expect(result).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('usa valores padrão quando filtro e filtros não são informados', () => {
    const download = vi.fn(() => true);

    exportSendHistoryCsv([row], { date: new Date(2026, 9, 1), download });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          filter: 'todos',
          filters: {},
          rows: 1,
        }),
      }),
    );
  });
});
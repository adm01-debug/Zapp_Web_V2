/**
 * Testa a exportação com auditoria do histórico de envios.
 *
 * Prova que `exportSendHistoryCsv` registra no log de auditoria
 * quem exportou, com filtro e número de linhas — e que sem permissão
 * (`canDownload: false`) ou com o download bloqueado nada é gravado
 * nem registrado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAudit } from '@/lib/audit';
import {
  exportSendHistoryCsv,
  buildSendHistoryCsv,
  type CatalogSendHistoryRow,
} from '../useCatalogSendHistory';

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'toast-1'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
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
  it('registra no log de auditoria o CSV que foi baixado, com filtro e número de linhas', async () => {
    const download = vi.fn<(csv: string, filename: string) => boolean>(() => true);

    const result = exportSendHistoryCsv([row, row], {
      filterKey: 'contact_123',
      filters: { contactId: '123' },
      date: new Date(2026, 9, 1),
      download,
    });

    expect(result).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    const [csv, filename] = download.mock.calls[0];
    expect(filename).toBe('catalogo_enviados_20261001.csv');
    expect(csv).toBe(buildSendHistoryCsv([row, row]));
    // A auditoria é agendada por queueMicrotask: escoa antes de conferir.
    await Promise.resolve();
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

  it('não registra auditoria quando o download é bloqueado', async () => {
    const download = vi.fn(() => false);

    const result = exportSendHistoryCsv([row], {
      filterKey: 'todos',
      date: new Date(2026, 9, 1),
      download,
    });

    expect(result).toBe(false);
    await Promise.resolve();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('sem permissão (canDownload: false) NÃO chama o download nem registra auditoria', async () => {
    const download = vi.fn(() => true);

    const result = exportSendHistoryCsv([row, row], {
      filterKey: 'contact_123',
      filters: { contactId: '123' },
      date: new Date(2026, 9, 1),
      download,
      canDownload: false,
    });

    expect(result).toBe(false);
    expect(download).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('sem `canDownload` e sem `download` injetado, o gate real bloqueia (fail-closed)', async () => {
    // `undefined` flui até o `triggerCsvDownload`, que normaliza para `false`
    // no gate único: nada é gravado e nada é registrado.
    const result = exportSendHistoryCsv([row], { date: new Date(2026, 9, 1) });

    expect(result).toBe(false);
    await Promise.resolve();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('usa valores padrão quando filtro e data não são informados', async () => {
    const download = vi.fn(() => true);

    exportSendHistoryCsv([row], { date: new Date(2026, 9, 1), download });

    await Promise.resolve();
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

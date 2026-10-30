/**
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-01 — a porta única de gravação de arquivo.
 *
 * Prova direta do contrato: `downloadFileWithPermission` é o ÚNICO lugar que
 * chama `URL.createObjectURL` + `anchor.click`, e sem `canDownload` (sem
 * exceção declarada) nada é gravado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFileWithPermission, notifyDownloadBlocked } from '../downloadFile';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

describe('Y29 — downloadFileWithPermission (porta única)', () => {
  const createObjectURL = vi.fn(() => 'blob:y29');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  let clicados: { href: string | null; download: string | null }[];

  beforeEach(() => {
    clicados = [];
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    click.mockClear();
    toastError.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      click();
      clicados.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sem permissão NÃO cria object URL nem clica — avisa e devolve false', () => {
    const entregou = downloadFileWithPermission(new Blob(['x']), 'dado.csv', { canDownload: false });

    expect(entregou).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(clicados).toHaveLength(0);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain('Download bloqueado');
  });

  it('com permissão grava o arquivo (object URL + anchor + revoke) e devolve true', () => {
    const entregou = downloadFileWithPermission(new Blob(['x'], { type: 'text/csv' }), 'catalogo.csv', { canDownload: true });

    expect(entregou).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicados).toEqual([{ href: 'blob:y29', download: 'catalogo.csv' }]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:y29');
    // O anchor não fica pendurado no DOM depois do clique.
    expect(document.querySelector('a[download="catalogo.csv"]')).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('exceção declarada (allowWithoutPermission) grava sem permissão — exige motivo no código', () => {
    const entregou = downloadFileWithPermission(new Blob(['codigos']), 'backup-codes-crm.txt', {
      canDownload: false,
      allowWithoutPermission: true,
      reason: 'códigos de backup MFA do próprio usuário autenticado',
    });

    expect(entregou).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicados[0].download).toBe('backup-codes-crm.txt');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('notifyDownloadBlocked é o aviso padrão e devolve false', () => {
    expect(notifyDownloadBlocked()).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

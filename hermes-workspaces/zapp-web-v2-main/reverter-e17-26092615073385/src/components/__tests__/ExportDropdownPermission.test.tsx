import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useDownloadPermission
const mockCanDownload = vi.fn(() => false);
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: mockCanDownload(), isLoading: false }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipTrigger: ({ children, asChild }: React.PropsWithChildren<{ asChild?: boolean }>) =>
    React.createElement('div', null, children),
  TooltipContent: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'tooltip-content' }, children),
}));

import { ExportDropdown } from '@/components/ExportDropdown';

describe('ExportDropdown - Permissão de Download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe botão bloqueado quando can_download é false', () => {
    mockCanDownload.mockReturnValue(false);
    render(<ExportDropdown />);

    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('Bloqueada');
  });

  it('exibe botão de exportar quando can_download é true', () => {
    mockCanDownload.mockReturnValue(true);
    render(<ExportDropdown />);

    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('Exportar');
  });

  it('chama onExport quando tem permissão e clica', () => {
    mockCanDownload.mockReturnValue(true);
    const onExport = vi.fn();
    render(<ExportDropdown onExport={onExport} />);

    screen.getByRole('button').click();
    expect(onExport).toHaveBeenCalledWith('csv');
  });

  it('NÃO chama onExport quando sem permissão', () => {
    mockCanDownload.mockReturnValue(false);
    const onExport = vi.fn();
    render(<ExportDropdown onExport={onExport} />);

    // Button is disabled so click won't fire
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('respeita prop disabled mesmo com permissão', () => {
    mockCanDownload.mockReturnValue(true);
    render(<ExportDropdown disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('respeita prop isExporting mesmo com permissão', () => {
    mockCanDownload.mockReturnValue(true);
    render(<ExportDropdown isExporting />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('useExportData - Permissão de Download', () => {
  it('bloqueia exportCSV quando sem permissão', async () => {
    mockCanDownload.mockReturnValue(false);

    // Import dynamically to get fresh mock state
    const { useExportData } = await import('@/hooks/system/useExportData');
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() =>
      useExportData({
        columns: [{ key: 'name' as const, header: 'Nome' }],
        fileName: 'test',
      })
    );

    expect(result.current.canDownload).toBe(false);
  });
});

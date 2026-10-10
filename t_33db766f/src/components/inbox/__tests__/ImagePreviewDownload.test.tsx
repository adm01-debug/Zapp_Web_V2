import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock useDownloadPermission
const mockCanDownload = vi.fn(() => false);
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: mockCanDownload(), isLoading: false }),
}));

// Mock sonner toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...filterDomProps(props), ref }, children)),
    img: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<HTMLImageElement>) =>
      React.createElement('img', { ...filterDomProps(props), ref })),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

// Filter out non-DOM props
function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

// Mock tooltip
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipTrigger: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TooltipContent: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
}));

import { ImagePreview } from '@/components/inbox/ImagePreview';

describe('ImagePreview - Permissão de Download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe botão de download com opacidade quando sem permissão', () => {
    mockCanDownload.mockReturnValue(false);
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);

    const buttons = screen.getAllByRole('button');
    // Download button should have opacity class
    const downloadBtn = buttons.find(btn => btn.className.includes('opacity-50'));
    expect(downloadBtn).toBeTruthy();
  });

  it('mostra toast de bloqueio ao clicar download sem permissão', () => {
    mockCanDownload.mockReturnValue(false);
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);

    const buttons = screen.getAllByRole('button');
    // Click the download button (second button)
    fireEvent.click(buttons[1]);

    expect(mockToastError).toHaveBeenCalledWith(
      '🔒 Download bloqueado por política de segurança',
      expect.objectContaining({
        description: expect.stringContaining('administrador'),
      })
    );
  });

  it('NÃO mostra classe de bloqueio quando tem permissão de download', () => {
    mockCanDownload.mockReturnValue(true);
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);

    const buttons = screen.getAllByRole('button');
    const downloadBtn = buttons[1];
    // Should not have cursor-not-allowed when allowed
    expect(downloadBtn.className).not.toContain('cursor-not-allowed');
  });

  it('botão de zoom funciona independente da permissão de download', () => {
    mockCanDownload.mockReturnValue(false);
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" />);

    const buttons = screen.getAllByRole('button');
    // Zoom button (first) should not be disabled
    expect(buttons[0]).not.toBeDisabled();
    fireEvent.click(buttons[0]);
    // Should not trigger download toast
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('botão fechar funciona independente da permissão de download', () => {
    const onClose = vi.fn();
    mockCanDownload.mockReturnValue(false);
    render(<ImagePreview src="https://example.com/img.jpg" alt="Test" onClose={onClose} />);

    const buttons = screen.getAllByRole('button');
    // Close button (third/last)
    fireEvent.click(buttons[2]);
    expect(onClose).toHaveBeenCalled();
  });
});

// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MFABackupCodes } from '../MFABackupCodes';

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// Mock URL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
URL.createObjectURL = mockCreateObjectURL;
URL.revokeObjectURL = mockRevokeObjectURL;

describe('MFABackupCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== RENDERING TESTS =====
  describe('Rendering', () => {
    it('renders title and description', () => {
      render(<MFABackupCodes />);
      expect(screen.getByText('Códigos de Backup')).toBeInTheDocument();
      expect(screen.getByText(/Salve estes códigos/)).toBeInTheDocument();
    });

    it('renders exactly 10 backup codes by default', () => {
      render(<MFABackupCodes />);
      const codeElements = screen.getAllByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(codeElements.length).toBe(10);
    });

    it('renders custom codes when provided', () => {
      const codes = ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'];
      render(<MFABackupCodes codes={codes} />);
      expect(screen.getByText('AAAA-BBBB')).toBeInTheDocument();
      expect(screen.getByText('CCCC-DDDD')).toBeInTheDocument();
      expect(screen.getByText('EEEE-FFFF')).toBeInTheDocument();
    });

    it('renders warning message about account recovery', () => {
      render(<MFABackupCodes />);
      expect(screen.getByText(/perder o acesso/)).toBeInTheDocument();
    });

    it('renders copy and download buttons', () => {
      render(<MFABackupCodes />);
      expect(screen.getByText('Copiar')).toBeInTheDocument();
      expect(screen.getByText('Baixar')).toBeInTheDocument();
    });

    it('renders "Salvei meus códigos" button initially', () => {
      render(<MFABackupCodes />);
      expect(screen.getByText('Salvei meus códigos')).toBeInTheDocument();
    });

    it('does not render regenerate button when no callback', () => {
      render(<MFABackupCodes />);
      expect(screen.queryByText('Regenerar Códigos')).not.toBeInTheDocument();
    });

    it('renders regenerate button when callback provided', () => {
      render(<MFABackupCodes onRegenerate={() => {}} />);
      expect(screen.getByText('Regenerar Códigos')).toBeInTheDocument();
    });

    it('renders shield icon', () => {
      const { container } = render(<MFABackupCodes />);
      expect(container.querySelector('.lucide-shield')).toBeInTheDocument();
    });

    it('renders codes in 2-column grid', () => {
      const { container } = render(<MFABackupCodes />);
      const grid = container.querySelector('.grid-cols-2');
      expect(grid).toBeInTheDocument();
    });
  });

  // ===== COPY FUNCTIONALITY =====
  describe('Copy functionality', () => {
    it('copies all codes to clipboard on click', async () => {
      const codes = ['TEST-CODE', 'ABCD-EFGH'];
      render(<MFABackupCodes codes={codes} />);
      fireEvent.click(screen.getByText('Copiar'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TEST-CODE\nABCD-EFGH');
    });

    it('shows check icon after copying', async () => {
      render(<MFABackupCodes />);
      fireEvent.click(screen.getByText('Copiar'));
      await waitFor(() => {
        const btn = screen.getByText('Copiar').closest('button');
        expect(btn?.querySelector('.lucide-check')).toBeInTheDocument();
      });
    });

    it('reverts copy icon after timeout', async () => {
      vi.useFakeTimers();
      const { unmount } = render(<MFABackupCodes />);
      fireEvent.click(screen.getByText('Copiar'));
      // O setTimeout(→ setCopied(false), 2000) dispara fora de um event handler;
      // o avanço dos timers precisa de act() para o React descarregar o re-render.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      const btn = screen.getByText('Copiar').closest('button');
      expect(btn?.querySelector('.lucide-copy')).toBeInTheDocument();
      unmount();
      vi.useRealTimers();
    });
  });

  // ===== DOWNLOAD FUNCTIONALITY =====
  describe('Download functionality', () => {
    it('creates a blob URL on download', () => {
      render(<MFABackupCodes />);
      fireEvent.click(screen.getByText('Baixar'));
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('revokes blob URL after download', () => {
      render(<MFABackupCodes />);
      fireEvent.click(screen.getByText('Baixar'));
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('creates blob with text/plain type', () => {
      render(<MFABackupCodes />);
      fireEvent.click(screen.getByText('Baixar'));
      const calls = (mockCreateObjectURL as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls.length).toBeGreaterThan(0);
      const blobArg = calls[calls.length - 1]![0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe('text/plain');
    });
  });

  // ===== CONFIRMATION FLOW =====
  describe('Confirmation flow', () => {
    it('shows confirm button initially, not conclude', () => {
      render(<MFABackupCodes onClose={() => {}} />);
      expect(screen.getByText('Salvei meus códigos')).toBeInTheDocument();
      expect(screen.queryByText('Concluir')).not.toBeInTheDocument();
    });

    it('shows conclude button after confirmation', () => {
      render(<MFABackupCodes onClose={() => {}} />);
      fireEvent.click(screen.getByText('Salvei meus códigos'));
      expect(screen.getByText('Concluir')).toBeInTheDocument();
      expect(screen.queryByText('Salvei meus códigos')).not.toBeInTheDocument();
    });

    it('calls onClose when conclude is clicked', () => {
      const onClose = vi.fn();
      render(<MFABackupCodes onClose={onClose} />);
      fireEvent.click(screen.getByText('Salvei meus códigos'));
      fireEvent.click(screen.getByText('Concluir'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // ===== REGENERATE =====
  describe('Regenerate', () => {
    it('calls onRegenerate when clicked', () => {
      const onRegenerate = vi.fn();
      render(<MFABackupCodes onRegenerate={onRegenerate} />);
      fireEvent.click(screen.getByText('Regenerar Códigos'));
      expect(onRegenerate).toHaveBeenCalledOnce();
    });
  });

  // ===== CODE FORMAT VALIDATION =====
  describe('Code format', () => {
    it('all generated codes match XXXX-XXXX pattern', () => {
      render(<MFABackupCodes />);
      const codeElements = screen.getAllByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(codeElements.length).toBe(10);
      codeElements.forEach(el => {
        expect(el.textContent).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      });
    });

    it('generates unique codes', () => {
      render(<MFABackupCodes />);
      const codeElements = screen.getAllByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      const codes = codeElements.map(el => el.textContent);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('renders with empty codes array', () => {
      render(<MFABackupCodes codes={[]} />);
      expect(screen.getByText('Códigos de Backup')).toBeInTheDocument();
    });

    it('renders with single code', () => {
      render(<MFABackupCodes codes={['ONLY-CODE']} />);
      expect(screen.getByText('ONLY-CODE')).toBeInTheDocument();
    });

    it('renders without optional props', () => {
      render(<MFABackupCodes />);
      expect(screen.getByText('Códigos de Backup')).toBeInTheDocument();
    });
  });
});

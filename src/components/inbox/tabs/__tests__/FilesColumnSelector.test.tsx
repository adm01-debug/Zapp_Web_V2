import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesColumnSelector } from '../FilesColumnSelector';
import type { FilesColumns } from '@/hooks/chat/useFilesViewState';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';

const opcoes = (cabem: FilesColumns[]): ColumnOption[] =>
  ([3, 4, 5] as FilesColumns[]).map((n) => ({ n, fits: cabem.includes(n) }));

beforeEach(() => localStorage.clear());

describe('FilesColumnSelector (etapa 13)', () => {
  it('mostra só as 3 opções do domínio (3, 4 e 5) e desabilita (com motivo) a que não cabe', () => {
    render(<FilesColumnSelector value={4} options={opcoes([3, 4])} onChange={vi.fn()} />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByTestId('files-columns-6')).toBeNull();
    expect(screen.queryByTestId('files-columns-8')).toBeNull();
    expect(screen.getByTestId('files-columns-5')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('files-columns-5')).toHaveAttribute('title', 'Não cabe na largura atual (máximo 4)');
    expect(screen.getByTestId('files-columns-4')).not.toHaveAttribute('aria-disabled');
  });

  it('marca aria-checked só na opção ativa', () => {
    render(<FilesColumnSelector value={5} options={opcoes([3, 4, 5])} onChange={vi.fn()} />);
    expect(screen.getByTestId('files-columns-5')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('files-columns-4')).toHaveAttribute('aria-checked', 'false');
  });

  it('não dispara onChange ao clicar numa opção que não cabe', () => {
    const onChange = vi.fn();
    render(<FilesColumnSelector value={4} options={opcoes([3, 4])} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('files-columns-5'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('setas navegam e selecionam pulando o que não cabe', () => {
    const onChange = vi.fn();
    render(<FilesColumnSelector value={4} options={opcoes([3, 4])} onChange={onChange} />);
    fireEvent.keyDown(screen.getByTestId('files-columns-4'), { key: 'ArrowRight' });
    // 5 não cabe: volta para a 3
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('é controlado: não escreve em localStorage nem depende da largura da janela', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const innerWidth = vi.spyOn(window, 'innerWidth', 'get');
    render(<FilesColumnSelector value={4} options={opcoes([3, 4, 5])} onChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('files-columns-5'));
    expect(setItem).not.toHaveBeenCalled();
    expect(innerWidth).not.toHaveBeenCalled();
    setItem.mockRestore();
    innerWidth.mockRestore();
  });
});

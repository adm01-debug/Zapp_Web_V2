import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Trash2 } from 'lucide-react';
import { TalkXConfirmDialog } from '../talkxShared';

// V08 (plano Talk X V3, P1-5): ações críticas não podem confirmar enquanto
// houver check pendente. Com um check não marcado, o botão de confirmar fica
// desabilitado e onConfirm não pode disparar. Este teste é a trava
// anti-regressão: se a confirmação voltar a passar sem check, quebra aqui.

describe('TalkXConfirmDialog — confirmação bloqueada por check pendente (V08)', () => {
  it('não chama onConfirm enquanto houver check não marcado', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <TalkXConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title="Excluir segmento?"
        description="Será excluído permanentemente."
        checks={[{ id: 'reconheco', label: 'Reconheço que a exclusão é permanente' }]}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />,
    );

    const confirmBtn = screen.getByRole('button', { name: 'Excluir' });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('chama onConfirm quando todos os checks estão marcados', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <TalkXConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title="Excluir segmento?"
        description="Será excluído permanentemente."
        checks={[{ id: 'reconheco', label: 'Reconheço que a exclusão é permanente' }]}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXDialogShell } from '../dialogs';

/**
 * X050 — a casca do modal do kit liga o texto de apoio como descrição acessível
 * (aria-describedby) e, sem texto, não aponta para id nenhum.
 */
describe('TalkXDialogShell — descrição acessível', () => {
  it('com description: o diálogo é descrito pelo texto (aria-describedby → elemento com o texto)', () => {
    render(
      <TalkXDialogShell open onClose={vi.fn()} title="Testar template" description="Envia a mensagem para um número.">
        <p>corpo</p>
      </TalkXDialogShell>,
    );
    const dialogo = screen.getByRole('dialog', { name: 'Testar template' });
    const id = dialogo.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe('Envia a mensagem para um número.');
  });

  it('sem description: sem aria-describedby (nada de id pendurado)', () => {
    render(
      <TalkXDialogShell open onClose={vi.fn()} title="Atividade recente">
        <p>corpo</p>
      </TalkXDialogShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Atividade recente' }).getAttribute('aria-describedby')).toBeNull();
  });
});

/**
 * Y18-4 / SHELL-09 (parte) — o aviso "Pressione Tab para navegar" pintava o `<kbd>`
 * da tecla com `bg-background`, quase o mesmo tom do painel do aviso (`bg-muted/95`):
 * a auditoria Y18 mediu 1,04:1 no axe do navegador real. O kbd passa a usar
 * `bg-card`, token que o destaca do painel nos dois temas.
 *
 * O jsdom não carrega o CSS do app e não calcula cor (o próprio repo declara isso
 * nos testes a11y — ver `WelcomeModal.a11y.test.tsx`): aqui se prova a ESTRUTURA,
 * ou seja, qual token de fundo o componente REALMENTE aplica no kbd do aviso.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SkipLinks } from '@/components/ui/skip-link';

afterEach(cleanup);

function comAlvoDePulo() {
  const alvo = document.createElement('main');
  alvo.id = 'main-content';
  document.body.appendChild(alvo);
  return () => document.body.removeChild(alvo);
}

describe('skip-link — contraste do atalho "Tab" (SHELL-09)', () => {
  it('o kbd do aviso usa token de fundo que destaca do painel (bg-card), não bg-background', async () => {
    const limpar = comAlvoDePulo();
    try {
      render(<SkipLinks />);

      // O aviso só aparece depois do primeiro Tab (estado `showIndicator`).
      expect(screen.queryByText('Tab')).toBeNull();
      fireEvent.keyDown(window, { key: 'Tab' });

      const kbd = await screen.findByText('Tab');
      expect(kbd.tagName).toBe('KBD');
      // O painel do aviso é `bg-muted/95` (linha ~112); repetir `bg-background`
      // no kbd deixava a tecla no mesmo tom do fundo.
      expect(kbd.className).toContain('bg-card');
      expect(kbd.className).not.toContain('bg-background');
    } finally {
      limpar();
    }
  });
});

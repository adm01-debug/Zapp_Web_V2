import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogTitle } from '../dialog';
import { Sheet, SheetContent, SheetTitle } from '../sheet';
import { Checkbox } from '../checkbox';
import { RadioGroup, RadioGroupItem } from '../radio-group';
import { Button } from '../button';
import { IconButton } from '../icon-button';

/**
 * t_17d91156 — contrato da classe de alvo de toque. O jsdom NÃO aplica media query, então
 * aqui só se trava o contrato: o primitivo carrega `alvo-toque-44` e a regra coarse existe
 * no CSS com 44px. A MEDIÇÃO em pixel real (Chromium com emulação de toque) fica em
 * `e2e/a11y-toque-44px.spec.ts` — este arquivo é a rede de segurança barata contra alguém
 * apagar a classe ou a regra.
 */
const CLASSE = 'alvo-toque-44';
afterEach(cleanup);

describe('alvo de toque 44px — contrato da classe no primitivo', () => {
  it('fechar do dialog e do sheet carregam alvo-toque-44', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialogo de teste</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(CLASSE);
    cleanup();

    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Painel de teste</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(CLASSE);
  });

  it('checkbox e radio carregam alvo-toque-44', () => {
    render(<Checkbox aria-label="Selecionar" />);
    expect(screen.getByRole('checkbox', { name: 'Selecionar' })).toHaveClass(CLASSE);

    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="Opcao A" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Opcao A' })).toHaveClass(CLASSE);
  });

  it('button: só os tamanhos abaixo de 44px ganham a classe (lg/xl/icon-lg já medem 44px+)', () => {
    for (const size of ['default', 'sm', 'icon', 'icon-sm'] as const) {
      const { unmount } = render(
        <Button size={size} aria-label={`botao ${size}`}>
          ok
        </Button>,
      );
      expect(screen.getByRole('button', { name: `botao ${size}` })).toHaveClass(CLASSE);
      unmount();
    }

    for (const size of ['lg', 'xl', 'icon-lg'] as const) {
      const { unmount } = render(
        <Button size={size} aria-label={`botao ${size}`}>
          ok
        </Button>,
      );
      expect(screen.getByRole('button', { name: `botao ${size}` })).not.toHaveClass(CLASSE);
      unmount();
    }
  });

  it('icon-button: sm e default ganham a classe; lg/xl já medem 48px+', () => {
    for (const size of ['sm', 'default'] as const) {
      const { unmount } = render(<IconButton size={size} showTooltip={false} aria-label={`icone ${size}`} />);
      expect(screen.getByRole('button', { name: `icone ${size}` })).toHaveClass(CLASSE);
      unmount();
    }

    for (const size of ['lg', 'xl'] as const) {
      const { unmount } = render(<IconButton size={size} showTooltip={false} aria-label={`icone ${size}`} />);
      expect(screen.getByRole('button', { name: `icone ${size}` })).not.toHaveClass(CLASSE);
      unmount();
    }
  });
});

describe('alvo de toque 44px — a regra só existe em ponteiro grosso', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/utilities.css'), 'utf8');

  it('a regra .alvo-toque-44 vive dentro de @media (pointer: coarse) e mede 44px', () => {
    const bloco = css.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/);
    expect(bloco, 'a regra coarse sumiu de src/styles/utilities.css').not.toBeNull();
    const dentro = bloco![1];
    expect(dentro).toContain(`.${CLASSE}`);
    expect(dentro).toMatch(/min-width:\s*44px/);
    expect(dentro).toMatch(/min-height:\s*44px/);
  });

  it('a classe não recebe 44px fora do media query (o desktop não muda)', () => {
    const foraDaCoarse = css.replace(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\n\}/, '');
    expect(foraDaCoarse).not.toContain(CLASSE);
  });
});

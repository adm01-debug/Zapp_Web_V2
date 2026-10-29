import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';

import { Dialog, DialogContent, DialogTitle } from '../dialog';
import { Sheet, SheetContent, SheetTitle } from '../sheet';
import { Checkbox } from '../checkbox';
import { RadioGroup, RadioGroupItem } from '../radio-group';
import { ALVO_TOQUE_GROSSO, Button } from '../button';
import { IconButton } from '../icon-button';

/**
 * t_17d91156 / refazer t_9a266076 — contrato do alvo de toque de 44px. O jsdom NÃO aplica
 * media query, então aqui só se trava o CONTRATO de duas metades que o refazer separou:
 *
 *  1. ÁREA DE TOQUE SEM MUDAR O DESENHO (`alvo-toque-44`): o X do dialog/sheet, o checkbox
 *     e o radio trazem a classe; a regra coarse dá a ela um `::after` de 44px centrado (a
 *     caixa de hit-test cresce, o desenho/borda/fundo ficam do tamanho normal). O alvo
 *     precisa ser posicionado para o `::after` ancorar nele — por isto o checkbox/radio
 *     carregam `relative` (o X já é `absolute`).
 *  2. BOTÕES pequenos: ganham a variante Tailwind `ALVO_TOQUE_GROSSO` na cva, não a classe
 *     (o Button/IconButton têm `overflow-hidden`, que recortaria o `::after`).
 *
 * A MEDIÇÃO em pixel real (Chromium com emulação de toque, medindo o que o ponteiro
 * realmente acerta) fica em `e2e/a11y-toque-44px.spec.ts`; este arquivo é a rede barata
 * contra alguém apagar a classe, a regra ou voltar com `display: inline-flex` / `min-*`.
 */
const CLASSE = 'alvo-toque-44';
afterEach(cleanup);

describe('alvo de toque 44px — contrato da classe no primitivo (desenho intacto)', () => {
  it('fechar do dialog e do sheet carregam alvo-toque-44', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialogo de teste</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(CLASSE);
    cleanup();

    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Painel de teste</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(CLASSE);
  });

  it('checkbox e radio carregam alvo-toque-44 e são posicionados (relative)', () => {
    render(<Checkbox aria-label="Selecionar" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar' });
    expect(checkbox).toHaveClass(CLASSE);
    expect(checkbox).toHaveClass('relative');

    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="Opcao A" />
      </RadioGroup>,
    );
    const radio = screen.getByRole('radio', { name: 'Opcao A' });
    expect(radio).toHaveClass(CLASSE);
    expect(radio).toHaveClass('relative');
  });
});

describe('alvo de toque 44px — botões usam a variante Tailwind, não a classe', () => {
  it('button: os tamanhos abaixo de 44px ganham a variante; lg/xl/icon-lg não', () => {
    for (const size of ['default', 'sm', 'icon', 'icon-sm'] as const) {
      const { unmount } = render(
        <Button size={size} aria-label={`botao ${size}`}>
          ok
        </Button>,
      );
      const botao = screen.getByRole('button', { name: `botao ${size}` });
      for (const token of ALVO_TOQUE_GROSSO.split(' ')) {
        expect(botao, `botao ${size} sem ${token}`).toHaveClass(token);
      }
      expect(botao, `botao ${size} não deve carregar ${CLASSE}`).not.toHaveClass(CLASSE);
      unmount();
    }

    for (const size of ['lg', 'xl', 'icon-lg'] as const) {
      const { unmount } = render(
        <Button size={size} aria-label={`botao ${size}`}>
          ok
        </Button>,
      );
      const botao = screen.getByRole('button', { name: `botao ${size}` });
      expect(botao, `botao ${size} já mede 44px+`).not.toHaveClass(CLASSE);
      expect(botao).not.toHaveClass(ALVO_TOQUE_GROSSO.split(' ')[0]);
      unmount();
    }
  });

  it('icon-button: sm e default ganham a variante; lg/xl já medem 48px+', () => {
    for (const size of ['sm', 'default'] as const) {
      const { unmount } = render(<IconButton size={size} showTooltip={false} aria-label={`icone ${size}`} />);
      const botao = screen.getByRole('button', { name: `icone ${size}` });
      expect(botao).toHaveClass(ALVO_TOQUE_GROSSO.split(' ')[0]);
      expect(botao).not.toHaveClass(CLASSE);
      unmount();
    }

    for (const size of ['lg', 'xl'] as const) {
      const { unmount } = render(<IconButton size={size} showTooltip={false} aria-label={`icone ${size}`} />);
      const botao = screen.getByRole('button', { name: `icone ${size}` });
      expect(botao).not.toHaveClass(CLASSE);
      expect(botao).not.toHaveClass(ALVO_TOQUE_GROSSO.split(' ')[0]);
      unmount();
    }
  });
});

describe('alvo de toque 44px — a regra só existe em ponteiro grosso, e só mexe no ::after', () => {
  // Sem os comentários: os comentários citam a classe e dariam falso positivo no
  // "fora do media query". O que se mede aqui é a DECLARAÇÃO real.
  const css = readFileSync(resolve(process.cwd(), 'src/styles/utilities.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('a regra coarse dá ao ::after 44x44 (área de toque, sem tocar no desenho)', () => {
    const bloco = css.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/);
    expect(bloco, 'a regra coarse sumiu de src/styles/utilities.css').not.toBeNull();
    const dentro = bloco![1];
    expect(dentro).toContain(`.${CLASSE}::after`);
    expect(dentro).toMatch(/width:\s*44px/);
    expect(dentro).toMatch(/height:\s*44px/);
    // Regressão t_9a266076: a versão anterior inflava a CAIXA (`min-width`/`min-height`)
    // com `display: inline-flex`, o que reexibia botão escondido (`hidden md:inline-flex`)
    // e pintava bloco de 44px no checkbox/radio/X. A classe NÃO pode voltar a fazer isso.
    expect(dentro).not.toMatch(/\.alvo-toque-44\s*\{/);
    expect(dentro).not.toContain('display:');
    expect(dentro).not.toMatch(/min-width:\s*44px/);
    expect(dentro).not.toMatch(/min-height:\s*44px/);
  });

  it('a classe não recebe 44px fora do media query (o desktop não muda)', () => {
    const foraDaCoarse = css.replace(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\n\}/, '');
    expect(foraDaCoarse).not.toContain(CLASSE);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import { Toaster, toast } from '@/components/ui/sonner';

/**
 * U1-04 (2ª passada da auditoria de paridade V3 -> V2, doc 13 — primitivos de UI).
 *
 * No celular o aviso do Sonner nascia a 16px do rodapé (`MOBILE_VIEWPORT_OFFSET`
 * do sonner 2.0.8, aplicado por `bottom: var(--mobile-offset-bottom)` dentro do
 * `@media (max-width: 600px)`) e cobria a `BottomNavigation` e o `MobileFAB`.
 *
 * A prova renderiza o `<Toaster/>` REAL (com um aviso de verdade) e lê o offset
 * que ele aplica no elemento do sonner; a geometria da barra e do FAB é lida dos
 * arquivos de origem, então mudar qualquer um dos três quebra o teste.
 */

const RAIZ_SRC = join(process.cwd(), 'src');

function ler(relativo: string): string {
  return readFileSync(join(RAIZ_SRC, relativo), 'utf8');
}

function pxDe(fonte: string, regex: RegExp, rotulo: string): number {
  const achado = fonte.match(regex);
  if (!achado) throw new Error(`não achei ${rotulo} com ${regex}`);
  return Number(achado[1]);
}

async function toasterMontado(): Promise<HTMLElement> {
  render(<Toaster />);
  act(() => {
    toast('Aviso de teste');
  });
  const elemento = document.querySelector<HTMLElement>('[data-sonner-toaster]');
  await waitFor(() => expect(document.querySelector('[data-sonner-toaster]')).not.toBeNull());
  return elemento ?? document.querySelector<HTMLElement>('[data-sonner-toaster]')!;
}

function valorDoOffset(elemento: HTMLElement, propriedade: string): string {
  const doStyle = elemento.style.getPropertyValue(propriedade);
  return doStyle || extrairDoAtributo(elemento, propriedade);
}

function extrairDoAtributo(elemento: HTMLElement, propriedade: string): string {
  const atributo = elemento.getAttribute('style') ?? '';
  const achado = new RegExp(`${propriedade}\\s*:\\s*([^;]+)`).exec(atributo);
  return achado ? achado[1].trim() : '';
}

/** `calc(140px + env(safe-area-inset-bottom, 0px))` -> 140 + inset informado. */
function emPx(declaracao: string, insetDaAreaSegura: number): number {
  const expressao = declaracao
    .replace(/^calc\(/, '')
    .replace(/\)\s*$/, '')
    .replace(/env\(\s*safe-area-inset-bottom[^)]*\)/g, `${insetDaAreaSegura}px`);

  return expressao
    .split('+')
    .reduce((total, parcela) => total + Number.parseFloat(parcela.trim()), 0);
}

describe('sonner — offset no celular (U1-04)', () => {
  it('aplica --mobile-offset-bottom em calc() com a área segura e preserva as laterais', async () => {
    const toaster = await toasterMontado();

    const offset = valorDoOffset(toaster, '--mobile-offset-bottom');
    expect(offset).not.toBe('');
    expect(offset).toMatch(/^calc\(\s*[\d.]+px\s*\+\s*env\(\s*safe-area-inset-bottom[^)]*\)\s*\)$/);

    // Só o rodapé muda: as laterais seguem o padrão do sonner (16px no mobile).
    expect(valorDoOffset(toaster, '--mobile-offset-right')).toBe('16px');
    expect(valorDoOffset(toaster, '--mobile-offset-left')).toBe('16px');
  });

  it('não sobrepõe a BottomNavigation (h-[60px] + borda) nem o MobileFAB', async () => {
    const toaster = await toasterMontado();

    const navSrc = ler('components/ui/mobile-components.tsx');
    const fabSrc = ler('components/mobile/MobileFAB.tsx');

    const alturaDaBarra = pxDe(navSrc, /h-\[(\d+)px\] px-1/, 'a altura da BottomNavigation') + 1; // border-t
    const baseDoFab = pxDe(fabSrc, /bottom-\[(\d+)px\]/, 'a base do MobileFAB');
    expect(fabSrc).toMatch(/h-14\b/); // h-14 = 56px
    const topoDoFab = baseDoFab + 56;

    const folgaSemNotch = emPx(valorDoOffset(toaster, '--mobile-offset-bottom'), 0);
    const folgaComNotch = emPx(valorDoOffset(toaster, '--mobile-offset-bottom'), 34);

    expect(folgaSemNotch).toBeGreaterThanOrEqual(alturaDaBarra);
    expect(folgaSemNotch).toBeGreaterThanOrEqual(topoDoFab);
    // O inset só desloca o aviso junto com a barra: a folga acima dos dois é a mesma.
    expect(folgaComNotch - 34).toBe(folgaSemNotch);
  });

  it('no desktop o offset continua o padrão do sonner (24px nas laterais e no rodapé)', async () => {
    const toaster = await toasterMontado();

    expect(valorDoOffset(toaster, '--offset-bottom')).toBe('24px');
    expect(valorDoOffset(toaster, '--offset-right')).toBe('24px');
  });
});

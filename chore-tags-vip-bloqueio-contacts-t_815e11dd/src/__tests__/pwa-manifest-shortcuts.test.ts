import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NavigationService } from '@/services/navigation.service';
import { resolveLegacyView } from '@/hooks/system/useNavigationHistory';

/**
 * Contrato dos app shortcuts (Web App Manifest) — SL-112 / item P2-3.14.
 *
 * O manifesto instalável (`public/manifest.json`) não declarava `shortcuts`: o
 * ícone do app instalado não oferecia nenhuma entrada direta de tela.
 *
 * O ESPERADO aqui não é texto solto do teste: os ids de tela vêm dos metadados
 * de navegação do próprio app (`NavigationService`) e o formato da URL é o
 * canônico que `useNavigationHistory` lê da `window.location` (`?view=<id>`).
 * Atalho apontando para tela que não existe, ou com nome diferente do que o app
 * exibe no menu, fica vermelho; ícone apontando para arquivo inexistente também.
 */

type ManifestIcon = { src: string; sizes: string; type: string };
type ManifestShortcut = {
  name?: string;
  short_name?: string;
  description?: string;
  url?: string;
  icons?: ManifestIcon[];
};
type Manifest = { scope?: string; icons?: ManifestIcon[]; shortcuts?: ManifestShortcut[] };

const PUBLIC_DIR = join(process.cwd(), 'public');
const manifest = JSON.parse(
  readFileSync(join(PUBLIC_DIR, 'manifest.json'), 'utf-8'),
) as Manifest;

/** Ids de tela que o app sabe abrir — fonte: metadados de navegação, não o teste. */
const VIEWS_NAVEGAVEIS = new Set(
  [
    ...NavigationService.getPrimaryNav(),
    ...NavigationService.getGroups().flatMap((group) => group.items),
    ...NavigationService.getAdvancedNav(),
  ].map((item) => item.id),
);

/** Telas de entrada que todo atalho do app instalado deve cobrir (as 4 do topo do menu). */
const ENTRADAS_PRIMARIAS = NavigationService.getPrimaryNav()
  .slice(0, 4)
  .map((item) => item.id);

/** Limite de atalhos que o navegador exibe (Chrome mostra no máximo 4). */
const MAX_ATALHOS = 4;

/** `/?view=<id>` -> `<id>`; qualquer outro formato devolve null. */
function viewIdDaUrl(url: string | undefined): string | null {
  if (!url || !url.startsWith('/?view=')) return null;
  return new URLSearchParams(url.slice(2)).get('view');
}

/** Menor lado declarado em `sizes` ("192x192 512x512" -> 192). */
function menorLado(sizes: string): number {
  const lados = sizes
    .trim()
    .split(/\s+/)
    .map((par) => par.split('x'))
    .filter((par) => par.length === 2)
    .map(([largura, altura]) => Math.min(Number(largura), Number(altura)))
    .filter((lado) => Number.isFinite(lado));
  return lados.length ? Math.min(...lados) : 0;
}

describe('manifest PWA: app shortcuts', () => {
  it('declara atalhos em quantidade que o navegador exibe', () => {
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts?.length ?? 0).toBeGreaterThan(0);
    expect(manifest.shortcuts?.length ?? 0).toBeLessThanOrEqual(MAX_ATALHOS);
  });

  it('cada atalho abre pelo ?view= uma tela que o app navega, com o nome do menu', () => {
    const usados = new Set<string>();

    for (const atalho of manifest.shortcuts ?? []) {
      const viewId = viewIdDaUrl(atalho.url);

      expect(viewId, `url do atalho "${atalho.name}" deveria ser /?view=<id>: ${atalho.url}`)
        .not.toBeNull();
      expect(VIEWS_NAVEGAVEIS.has(viewId as string), `tela inexistente no atalho: ${atalho.url}`)
        .toBe(true);
      // O ?view= tem de abrir EXATAMENTE essa tela (useNavigationHistory remapeia
      // ids legados: `?view=pipeline` cai em `tasks`, então o rótulo mentiria).
      expect(resolveLegacyView(viewId as string), `tela remapeada no atalho: ${atalho.url}`)
        .toBe(viewId);
      // Mesmo rótulo do menu: o atalho não inventa nome nem duplica tela.
      expect(atalho.name).toBe(NavigationService.getViewLabel(viewId as string));
      expect(usados.has(viewId as string), `tela repetida em atalhos: ${viewId}`).toBe(false);
      usados.add(viewId as string);

      if (atalho.short_name !== undefined) expect(atalho.short_name.trim()).not.toBe('');
      if (atalho.description !== undefined) expect(atalho.description.trim()).not.toBe('');
    }
  });

  it('cobre as telas de entrada do menu do app', () => {
    const idsDeclarados = new Set((manifest.shortcuts ?? []).map((a) => viewIdDaUrl(a.url)));

    for (const entrada of ENTRADAS_PRIMARIAS) {
      expect(idsDeclarados.has(entrada), `atalho faltando para a tela "${entrada}"`).toBe(true);
    }
  });

  it('cada atalho traz ícone de 96x96 ou maior, existente em public/', () => {
    for (const atalho of manifest.shortcuts ?? []) {
      expect(atalho.icons?.length ?? 0).toBeGreaterThan(0);

      for (const icone of atalho.icons ?? []) {
        expect(menorLado(icone.sizes), `ícone pequeno no atalho "${atalho.name}": ${icone.sizes}`)
          .toBeGreaterThanOrEqual(96);
        expect(
          existsSync(join(PUBLIC_DIR, icone.src.replace(/^\//, ''))),
          `ícone ausente em public/: ${icone.src}`,
        ).toBe(true);
      }
    }
  });
});

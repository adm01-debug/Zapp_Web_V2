// E34 — deep link ?view=catalog&cat=<id>. Mesmo padrao de
// talkxWizardRoute.ts (checado antes de escrever): rejeita valor
// malformado/duplicado em vez de coagir silenciosamente, replaceState
// (nao pushState) porque um filtro de categoria nao e um passo de
// navegacao - o usuario nao esperaria o botao voltar desfazer cada
// clique de chip, um por um.

const CATEGORY_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

export type ParsedCatalogCategoryRoute = {
  categoryId: string | null;
  /** O chamador deve substituir o endereco sem criar entrada de historico. */
  needsNormalization: boolean;
};

/** Parseia so a parte do catalogo da query string. `undefined` = ausente,
 * `null` = duplicado/malformado e nunca deve selecionar uma categoria. */
export function parseCatalogCategoryRoute(search: string): ParsedCatalogCategoryRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const rawCat = readSingle(params, 'cat');

  if (rawCat === undefined) {
    return { categoryId: null, needsNormalization: false };
  }
  if (view !== 'catalog' || rawCat === null || !CATEGORY_ID.test(rawCat)) {
    return { categoryId: null, needsNormalization: true };
  }
  return { categoryId: rawCat, needsNormalization: false };
}

export function formatCatalogCategoryRoute(current: URL, categoryId: string | null): string {
  const url = new URL(current.href);
  if (categoryId) {
    url.searchParams.set('view', 'catalog');
    url.searchParams.set('cat', categoryId);
  } else {
    url.searchParams.delete('cat');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceCatalogCategoryRoute(categoryId: string | null): void {
  window.history.replaceState(null, '', formatCatalogCategoryRoute(new URL(window.location.href), categoryId));
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NavigationService } from '../../src/services/navigation.service';

// F25 / TL-023 · Multiplix — CONTRATO da matriz perfil × papel × escopo.
//
// O defeito real (inventário F25, 07/10): a matriz existe em três lugares que podiam divergir
// em silêncio — o SEED (`role_permissions`), o CÓDIGO (nav/rota e o gate de entrada do worker)
// e o DOC `docs/multiplix/PERMISSOES.md`. O doc, em especial, continuava descrevendo a
// semeadura como ALVO ("migration que ainda não está neste repo", células 🎯) muito depois de
// a migration do seed já estar versionada em `supabase/migrations/` — documento que existe e
// diverge do código mente todo dia.
//
// Por isso este contrato não confere texto solto: ele usa o SEED como fonte independente e
// exige que o doc e os dois gates concordem com ele —
//   * os 9 pares `(papel, permissão)` são lidos do próprio SQL do seed;
//   * a matriz do `PERMISSOES.md` (§1) tem de marcar como versionado **exatamente** esses
//     pares, e não pode marcar alvo (🎯) para o que já está no repo;
//   * o nome que o seed cria (`multiplix.dispatch.create`) tem de ser o mesmo literal que a
//     nav/rota (`NavigationService`) e o gate de entrada do worker (`multiplix-send`) leem;
//   * `multiplix.dispatch.manage_all` (o par que já vinha de outra migration) idem;
//   * nenhuma edge lê permissão que as migrations do módulo não criem.
//   * e o caso (f) não confere texto: ele IMPORTA `NavigationService` de verdade e checa
//     menu (`filterNavItems`) e rota (`canAccess`) — liberando pelo nome e negando por papel.
//
// Se alguém renomear a permissão num lugar só, ou voltar o doc para "alvo", isto fica vermelho.
// Roda em `bun run test:contracts` (vitest.contracts.config.ts, `tests/contracts/**`).

const RAIZ = process.cwd();
const PERMISSOES = 'docs/multiplix/PERMISSOES.md';
const PONTE_SINGU = 'docs/multiplix/PONTE_SINGU.md';
const SEED_MATRIZ = 'supabase/migrations/20260930620000_multiplix_role_permissions_matrix.sql';
const SEED_CATALOGO = 'supabase/migrations/20260926150000_seed_multiplix_audience_permissions.sql';
const SEED_MANAGE_ALL = 'supabase/migrations/20260929640000_multiplix_dispatch_manage_all_permission.sql';
const NAV_SERVICE = 'src/services/navigation.service.ts';
const VIEW_ROUTER = 'src/pages/ViewRouter.tsx';
const SEND_INDEX = 'supabase/functions/multiplix-send/index.ts';
const DISPATCH_INDEX = 'supabase/functions/multiplix-dispatch/index.ts';
const AUDIENCE_INDEX = 'supabase/functions/multiplix-audience/index.ts';

const ler = (rel: string): string => readFileSync(`${RAIZ}/${rel}`, 'utf8');

/** Os 4 papéis do enum `app_role` — a matriz não inventa papel. */
const PAPEIS = ['admin', 'supervisor', 'agent', 'special_agent'];

/** Nomes entre crases de um trecho, no formato `multiplix.*`. */
function nomesMultiplix(trecho: string): string[] {
  return Array.from(trecho.matchAll(/`(multiplix\.[a-z0-9_.]+)`/g)).map((m) => m[1]);
}

/** Pares `(papel, permissão)` do bloco `VALUES` do seed da matriz — a fonte da verdade. */
function paresDoSeed(): Array<[string, string]> {
  const src = ler(SEED_MATRIZ);
  const inicio = src.indexOf('FROM (VALUES');
  expect(inicio, `${SEED_MATRIZ}: bloco FROM (VALUES) não encontrado`).toBeGreaterThanOrEqual(0);
  const fim = src.indexOf(') AS v(', inicio);
  expect(fim, `${SEED_MATRIZ}: fim do bloco VALUES não encontrado`).toBeGreaterThan(inicio);
  return Array.from(
    src
      .slice(inicio, fim)
      .matchAll(/\('([a-z_]+)'::public\.app_role\s*,\s*'([a-z0-9_.]+)'\)/g),
  ).map((m) => [m[1], m[2]]);
}

/** Permissões que o seed cria no catálogo (`INSERT INTO public.permissions`). */
function catalogoDoSeed(): string[] {
  const src = ler(SEED_MATRIZ);
  const inicio = src.indexOf('INSERT INTO public.permissions');
  expect(inicio, `${SEED_MATRIZ}: INSERT INTO public.permissions não encontrado`).toBeGreaterThanOrEqual(0);
  const fim = src.indexOf(';', inicio);
  return Array.from(src.slice(inicio, fim).matchAll(/'(multiplix\.[a-z0-9_.]+)'/g)).map((m) => m[1]);
}

/** Tudo que as migrations do módulo criam no catálogo (as 5 de audiência + 2 de disparo). */
function catalogoDoModulo(): string[] {
  return Array.from(
    new Set([
      ...Array.from(ler(SEED_CATALOGO).matchAll(/\('(multiplix\.[a-z0-9_.]+)'\s*,/g)).map((m) => m[1]),
      ...Array.from(ler(SEED_MANAGE_ALL).matchAll(/\('(multiplix\.[a-z0-9_.]+)'\s*,/g)).map((m) => m[1]),
      ...catalogoDoSeed(),
    ]),
  ).sort();
}

/** A matriz do §1 do doc: colunas (permissões), células ✅ (versionado) e 🎯 (alvo). */
function matrizDoDoc(): {
  permissoes: string[];
  marcadas: Array<[string, string]>;
  alvos: Array<[string, string]>;
} {
  const linhas = ler(PERMISSOES).split('\n');
  const cabecalho = linhas.findIndex((l) => l.startsWith('| Papel (`app_role`)'));
  expect(cabecalho, `${PERMISSOES}: cabeçalho da matriz (§1) não encontrado`).toBeGreaterThanOrEqual(0);
  const permissoes = nomesMultiplix(linhas[cabecalho]);
  expect(permissoes.length, `${PERMISSOES}: cabeçalho da matriz sem as permissões em crases`).toBeGreaterThan(0);

  const marcadas: Array<[string, string]> = [];
  const alvos: Array<[string, string]> = [];
  for (let i = cabecalho + 2; i < linhas.length && linhas[i].startsWith('|'); i++) {
    const celulas = linhas[i].split('|').slice(1, -1).map((c) => c.trim());
    const papel = /^`([a-z_]+)`$/.exec(celulas[0])?.[1];
    expect(papel, `${PERMISSOES}: linha da matriz sem papel em crases: ${linhas[i]}`).toBeTruthy();
    expect(PAPEIS, `${PERMISSOES}: papel fora do enum app_role: ${String(papel)}`).toContain(papel);
    celulas.slice(1).forEach((celula, coluna) => {
      const par: [string, string] = [String(papel), String(permissoes[coluna])];
      if (celula.includes('✅')) marcadas.push(par);
      if (celula.includes('🎯')) alvos.push(par);
    });
  }
  return { permissoes, marcadas, alvos };
}

const comoTexto = (pares: Array<[string, string]>): string[] =>
  pares.map(([papel, permissao]) => `${papel} → ${permissao}`).sort();

describe('F25/TL-023 · matriz perfil × papel × escopo — doc, seed e gates concordam', () => {
  it('(a) o seed da matriz cria os 9 pares da F25 (admin 3, supervisor 4, agent 2)', () => {
    const pares = paresDoSeed();
    expect(comoTexto(pares)).toEqual(
      comoTexto([
        ['admin', 'multiplix.audience.admin'],
        ['admin', 'multiplix.dispatch.create'],
        ['admin', 'multiplix.dispatch.manage_all'],
        ['supervisor', 'multiplix.audience.suppliers'],
        ['supervisor', 'multiplix.audience.carriers'],
        ['supervisor', 'multiplix.audience.customers.all'],
        ['supervisor', 'multiplix.dispatch.create'],
        ['agent', 'multiplix.audience.customers.own'],
        ['agent', 'multiplix.dispatch.create'],
      ]),
    );
    expect(pares).toHaveLength(9);
    // `special_agent` existe no enum e está na matriz com todas as células vazias.
    expect(pares.some(([papel]) => papel === 'special_agent')).toBe(false);
  });

  it('(b) o §1 do PERMISSOES.md marca como VERSIONADO exatamente os pares do seed', () => {
    const pares = paresDoSeed();
    const { marcadas, alvos, permissoes } = matrizDoDoc();

    // As colunas do doc são exatamente as permissões distintas do seed.
    expect(Array.from(new Set(pares.map(([, p]) => p))).sort()).toEqual(Array.from(permissoes).sort());

    // ✅ no doc == o que o seed grava. Um lugar só manda: o SQL.
    expect(comoTexto(marcadas)).toEqual(comoTexto(pares));

    // O seed ESTÁ no repo: célula marcada como ALVO (🎯) para ele é o doc mentindo.
    expect(alvos, `PERMISSOES.md ainda marca alvo (🎯): ${JSON.stringify(alvos)}`).toEqual([]);
  });

  it('(c) os docs apontam para o seed que materializa a matriz e não o descrevem como pendente', () => {
    const doc = ler(PERMISSOES);
    expect(doc).toContain('20260930620000_multiplix_role_permissions_matrix.sql');
    for (const frase of [
      'migration que **ainda não está neste repo**',
      'é uma migration **a criar**',
      'sem nenhuma atribuição a papel',
    ]) {
      expect(doc, `PERMISSOES.md ainda descreve a semeadura como pendente: "${frase}"`).not.toContain(frase);
    }

    // Mesmo defeito, outro doc do mesmo item (F25 citada no §6.5 da ponte): o seed não é
    // rascunho com versão reservada — ele está versionado com a versão real.
    const ponte = ler(PONTE_SINGU);
    expect(ponte).toContain('20260930620000_multiplix_role_permissions_matrix.sql');
    expect(ponte).not.toContain('__VERSAO___multiplix_role_permissions_matrix.sql');
    expect(ponte).not.toContain('EM ANDAMENTO na branch (2026-10-01)');
  });

  it('(d) nav, rota e worker leem o MESMO literal de permissão que o seed cria', () => {
    const pares = paresDoSeed();
    const criada = pares.map(([, p]) => p).find((p) => p === 'multiplix.dispatch.create');
    expect(criada, 'o seed precisa criar multiplix.dispatch.create').toBe('multiplix.dispatch.create');

    const nav = ler(NAV_SERVICE);
    const literalNav = /const MULTIPLIX_DISPATCH_CREATE = '([^']+)'/.exec(nav)?.[1];
    expect(literalNav, `${NAV_SERVICE}: constante MULTIPLIX_DISPATCH_CREATE ausente`).toBe(criada);
    // A entrada de nav gateia pela PERMISSÃO (não por papel) — menu e URL.
    expect(nav).toContain('permission: MULTIPLIX_DISPATCH_CREATE');
    expect(nav).toMatch(/if \(item\.permission && !userPermissions\.includes\(item\.permission\)\) return false;/);
    expect(nav).toMatch(/if \(item\.permission\) return userPermissions\.includes\(item\.permission\);/);
    // A rota recebe as permissões resolvidas, senão `canAccess` negaria todo mundo.
    expect(ler(VIEW_ROUTER)).toMatch(/NavigationService\.canAccess\(currentView, roles, permissions\)/);

    const send = ler(SEND_INDEX);
    const literalSend = /const DISPATCH_CREATE_PERMISSION = "([^"]+)"/.exec(send)?.[1];
    expect(literalSend, `${SEND_INDEX}: constante DISPATCH_CREATE_PERMISSION ausente`).toBe(criada);
    expect(send).toContain('_permission_name: DISPATCH_CREATE_PERMISSION');
    // O gate de entrada do worker aceita a permissão (senão o `agent` da matriz levava 403).
    expect(send).toMatch(/isAdminOrSupervisor !== true && !hasManageAll && !hasDispatchCreate/);
  });

  it('(e) o gate do worker limita a permissão ao DONO do disparo (entrada ≠ disparo alheio)', () => {
    const send = ler(SEND_INDEX);
    // `manage_all` é o único caminho para operar disparo de terceiro...
    expect(send).toContain('_permission_name: "multiplix.dispatch.manage_all"');
    expect(paresDoSeed()).toContainEqual(['admin', 'multiplix.dispatch.manage_all']);
    // ...e `dispatch.create` sozinha NÃO abre o disparo de outro dono.
    expect(send).toMatch(/const canManageDispatch = async \(createdBy: string \| null\): Promise<boolean> => \{/);
    expect(send).toMatch(/if \(hasManageAll\) return true;/);
    expect(send).toMatch(/return Boolean\(profileId && createdBy && profileId === createdBy\);/);
  });

  it('(f) o gate REAL de nav/rota (NavigationService) libera e nega pela permissão nomeada', () => {
    const PERM = 'multiplix.dispatch.create';

    // O MENU: sem a permissão o item não aparece — nem para `admin`/`supervisor`...
    const semPermissao = NavigationService.filterNavItems(NavigationService.getPrimaryNav(), ['admin', 'supervisor'], []);
    expect(semPermissao.some((i) => i.id === 'multiplix')).toBe(false);
    // ...e com ela aparece, mesmo para o papel mínimo autorizado pela matriz (`agent`).
    const comPermissao = NavigationService.filterNavItems(NavigationService.getPrimaryNav(), ['agent'], [PERM]);
    expect(comPermissao.some((i) => i.id === 'multiplix')).toBe(true);

    // A ROTA (`?view=multiplix`): negada por URL direta sem a permissão, liberada com ela.
    expect(NavigationService.canAccess('multiplix', ['admin', 'supervisor'], [])).toBe(false);
    expect(NavigationService.canAccess('multiplix', ['agent'], [PERM])).toBe(true);

    // O que a nav EXIGE é exatamente a permissão que o seed cria (o doc e o gate concordam).
    expect(NavigationService.getRequiredPermissions()).toContain(PERM);
    expect(paresDoSeed().map(([, p]) => p)).toContain(PERM);
  });

  it('(g) nenhuma edge lê permissão que as migrations do módulo não criem', () => {
    const catalogo = catalogoDoModulo();
    // As 7 do módulo: 5 de audiência + dispatch.create + dispatch.manage_all.
    expect(catalogo).toEqual([
      'multiplix.audience.admin',
      'multiplix.audience.carriers',
      'multiplix.audience.customers.all',
      'multiplix.audience.customers.own',
      'multiplix.audience.suppliers',
      'multiplix.dispatch.create',
      'multiplix.dispatch.manage_all',
    ]);
    // As colunas da matriz (§1) são exatamente o catálogo do módulo.
    expect(Array.from(matrizDoDoc().permissoes).sort()).toEqual(catalogo);

    const lidasNaAudiencia = Array.from(
      ler(AUDIENCE_INDEX).matchAll(/userHasPermission\('(multiplix\.[a-z0-9_.]+)'\)/g),
    ).map((m) => m[1]);
    expect(lidasNaAudiencia).toHaveLength(5);
    for (const nome of lidasNaAudiencia) {
      expect(catalogo, `a edge lê "${nome}", que nenhuma migration do módulo cria`).toContain(nome);
    }
    // O `manage_all` lido pelo worker de domínio é o mesmo nome literal do módulo.
    expect(ler(DISPATCH_INDEX)).toMatch(/export const MANAGE_ALL_PERMISSION = 'multiplix\.dispatch\.manage_all';/);
    expect(ler(DISPATCH_INDEX)).toContain('_permission_name: MANAGE_ALL_PERMISSION');
    expect(nomesMultiplix(ler(PERMISSOES))).toContain('multiplix.dispatch.manage_all');
  });
});

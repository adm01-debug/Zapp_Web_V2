/** Administração (papéis/usuários): trocar papel, desativar, forçar logout e o
 * barramento de quem NÃO é admin em `/admin/*`.
 *
 * Por que esta spec existe: até aqui nenhuma prova de tela cobria os três
 * controles destrutivos da tabela de usuários (`AdminUsersTable`) nem o
 * barramento por papel nas rotas `/admin/*`. Sem isso, um `return` a mais ou um
 * `isAdmin` invertido passaria com a suíte inteira verde.
 *
 * Metodologia (a mesma de `e2e/tarefas-linha-de-base.spec.ts`): sessão FALSA
 * (`installFakeSession`), app shell mockado (`mockAppShell`) e rede real barrada
 * (`bloquearRedeReal`, conferida no `afterEach`) — DESLOGADO, sem `setup`, sem
 * secrets e sem banco. Cada mutação é provada pelo CONTRATO que o app envia ao
 * backend (path + corpo capturados na rota), e não pela cor do botão: é isso que
 * distingue "chamou a RPC certa com o usuário certo" de "não fez nada".
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { bloquearRedeReal, json, mockAppShell, querObjetoUnico, type Registro } from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

// Deslogado de propósito: a sessão vem de `installFakeSession`.
test.use({ storageState: { cookies: [], origins: [] } });

const ALVO_ID = '00000000-0000-4000-8000-000000000002';
const SEM_PAPEL_ID = '00000000-0000-4000-8000-000000000003';

/** Linha de `profiles` como o `useAdminData` espera (mesmos campos do select). */
function perfil(over: { id: string; user_id: string; name: string; email: string }) {
  return {
    id: over.id,
    user_id: over.user_id,
    name: over.name,
    email: over.email,
    avatar_url: null,
    nickname: null,
    signature: null,
    job_title: null,
    department: null,
    phone: null,
    access_level: 'basic',
    max_chats: null,
    can_download: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const PERFIL_ADMIN = perfil({ id: 'p-admin', user_id: FAKE_USER_ID, name: 'Admin E2E', email: 'admin@test.local' });
const PERFIL_ALVO = perfil({ id: 'p-alvo', user_id: ALVO_ID, name: 'Alvo E2E', email: 'alvo@test.local' });
const PERFIL_SEM_PAPEL = perfil({ id: 'p-novo', user_id: SEM_PAPEL_ID, name: 'Novo E2E', email: 'novo@test.local' });
const PERFIS = [PERFIL_ADMIN, PERFIL_ALVO, PERFIL_SEM_PAPEL];

type Papel = 'admin' | 'supervisor' | 'agent';

/** Guarda o registro de rede de cada página para o `afterEach` conferir o bloqueio. */
const REGISTRO_POR_PAGINA = new WeakMap<Page, Registro>();

type Captura = {
  /** RPCs de mutação de papel, na ordem em que chegaram. */
  rpcs: { nome: string; body: unknown }[];
  /** PATCHes em `profiles` (desativação/reativação). */
  patches: { path: string; body: unknown }[];
  /** Invocações de Edge Function (forçar logout). */
  edges: { path: string; body: unknown }[];
  /** Leituras de `profiles` — serve para provar que a lista RECARREGOU. */
  leiturasDePerfis: number;
};

/**
 * Mocks da Administração. Registre `bloquearRedeReal` ANTES e as rotas locais
 * DEPOIS de `mockAppShell` (o Playwright casa na ordem INVERSA de registro, então
 * as rotas daqui têm prioridade sobre as do shell).
 *
 * `papel` é a role da SESSÃO (a linha em `user_roles` do usuário fake); as linhas
 * dos OUTROS usuários não mudam — é o que permite afirmar que o app age sobre o
 * usuário da LINHA, e não sobre quem está logado.
 */
async function prepararAdmin(
  page: Page,
  papel: Papel,
): Promise<{ registro: Registro; captura: Captura }> {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  const captura: Captura = { rpcs: [], patches: [], edges: [], leiturasDePerfis: 0 };

  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);

  await page.route(/\/rest\/v1\/profiles/, (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      captura.patches.push({ path: req.url(), body: req.postDataJSON() });
      // PostgREST responde 204 quando não há `Prefer: return=representation`.
      return route.fulfill({ status: 204, body: '' });
    }
    captura.leiturasDePerfis += 1;
    // `.maybeSingle()` NÃO pede o objeto ao PostgREST (o client confere sozinho que
    // veio no máximo 1 linha), então respondemos ARRAY já filtrado pelo `eq` da query:
    // sem isso o fetchProfile do useAuth recebe 3 linhas e falha com PGRST116.
    const filtro = /[?&](?:user_id|id)=eq\.([^&]+)/.exec(req.url())?.[1];
    if (filtro) {
      const alvo = decodeURIComponent(filtro);
      const linhas = PERFIS.filter((p) => p.user_id === alvo || p.id === alvo);
      return json(route, querObjetoUnico(route) ? linhas[0] ?? null : linhas);
    }
    return json(route, querObjetoUnico(route) ? PERFIL_ADMIN : PERFIS);
  });

  const linhasDePapel = [
    { id: 'r-admin', user_id: FAKE_USER_ID, role: papel },
    { id: 'r-alvo', user_id: ALVO_ID, role: 'agent' },
  ];
  await page.route(/\/rest\/v1\/user_roles/, (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      captura.rpcs.push({ nome: 'escrita-direta-em-user_roles', body: req.postDataJSON() });
      return json(route, { message: 'escrita direta bloqueada' }, 403);
    }
    const filtro = /[?&]user_id=eq\.([^&]+)/.exec(req.url())?.[1];
    if (filtro) {
      const alvo = decodeURIComponent(filtro);
      const linhas = linhasDePapel.filter((l) => l.user_id === alvo);
      return json(route, querObjetoUnico(route) ? linhas[0] ?? null : linhas);
    }
    return json(route, querObjetoUnico(route) ? linhasDePapel[0] : linhasDePapel);
  });

  await page.route(/\/rest\/v1\/rpc\/(admin_set_role|admin_add_role|admin_remove_role)/, (route) => {
    const nome = /rpc\/([a-z_]+)/.exec(route.request().url())?.[1] ?? 'desconhecida';
    captura.rpcs.push({ nome, body: route.request().postDataJSON() });
    return json(route, null);
  });

  await page.route(/\/functions\/v1\/revoke-auth-sessions/, (route) => {
    captura.edges.push({ path: route.request().url(), body: route.request().postDataJSON() });
    return json(route, { revoked: 1 });
  });

  await installFakeSession(page);
  REGISTRO_POR_PAGINA.set(page, registro);
  return { registro, captura };
}

/** Abre `?view=admin` e espera o heading PRÓPRIO da tela DENTRO do `<main>`. */
async function abrirAdministracao(page: Page): Promise<void> {
  await irPara(page, '/?view=admin', esperaAdministracao(page));
}

function esperaAdministracao(page: Page): Locator {
  return page
    .getByRole('main', { name: 'Conteúdo principal' })
    .getByRole('heading', { name: 'Administração' });
}

/**
 * Navega e espera o app MONTAR (o `esperado` aparecer). A máquina de E2E é
 * compartilhada com outros agentes e, sob carga, o bundle pode passar do guard de
 * montagem de 8 s do PRÓPRIO app — aí a tela mostra "Falha ao inicializar o app",
 * que é ruído de infraestrutura, não defeito: uma recarga resolve, porque o bundle
 * já está compilado. Se o guard não estiver na tela, o erro é real e sobe na hora.
 */
async function irPara(page: Page, url: string, esperado: Locator): Promise<void> {
  const guarda = page.getByRole('heading', { name: /Falha ao inicializar o app/ });
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await expect(esperado).toBeVisible({ timeout: 20_000 });
      return;
    } catch (erro) {
      if (!(await guarda.isVisible().catch(() => false))) throw erro;
    }
  }
  await expect(esperado).toBeVisible({ timeout: 20_000 });
}

async function linhaDoAlvo(page: Page) {
  const linha = page.getByRole('row', { name: /Alvo E2E/ });
  await expect(linha).toBeVisible({ timeout: 30_000 });
  return linha;
}

test.describe('Administração: papéis, desativação e forçar logout', () => {
  // O aquecimento abaixo abre/navega um browser frio: sob carga da máquina ele
  // passa dos 30 s padrão e derrubava o `beforeAll` (medido: 1 falha + 1 "did not
  // run" antes de o teto subir). O teto maior vale para os testes e para os hooks.
  test.describe.configure({ timeout: 90_000 });

  // Sem `beforeAll` de aquecimento de propósito: sob carga da máquina o hook de 30 s
  // estourava (o browser frio demora mais que isso) e derrubava testes que passam.
  // O `irPara` cobre o mesmo caso com recarga, sem depender de tempo de hook.
  test('trocar o papel de um usuário grava pela RPC admin_set_role e recarrega a lista', async ({ page }) => {
    const { captura } = await prepararAdmin(page, 'admin');
    await abrirAdministracao(page);

    const linha = await linhaDoAlvo(page);
    const combo = linha.getByRole('combobox', { name: 'Alterar role de Alvo E2E' });
    // Anti-vacuidade: o controle tem de começar no papel ATUAL da linha, senão o
    // "trocar" seria só reenviar o mesmo valor e nada provaria a mudança.
    await expect(combo).toHaveText(/Atendente/);
    const leiturasAntes = captura.leiturasDePerfis;

    await combo.click();
    await page.getByRole('option', { name: 'Supervisor' }).click();

    await expect.poll(() => captura.rpcs.length).toBe(1);
    expect(captura.rpcs[0]).toEqual({
      nome: 'admin_set_role',
      body: { _user_id: ALVO_ID, _role: 'supervisor' },
    });
    await expect(page.getByText('Usuário agora é Supervisor.')).toBeVisible({ timeout: 15_000 });
    // A lista recarregou depois da mutação (fetchData) — não é um toast solto.
    await expect.poll(() => captura.leiturasDePerfis).toBeGreaterThan(leiturasAntes);
  });

  test('desativar um usuário grava is_active=false no profile da LINHA', async ({ page }) => {
    const { captura } = await prepararAdmin(page, 'admin');
    await abrirAdministracao(page);

    const linha = await linhaDoAlvo(page);
    const chave = linha.getByRole('switch', { name: 'Ativar/desativar Alvo E2E' });
    await expect(chave).toBeChecked();

    await chave.click();

    await expect.poll(() => captura.patches.length).toBe(1);
    expect(captura.patches[0].body).toEqual({ is_active: false });
    // O alvo da escrita é a LINHA (p-alvo), nunca o usuário logado.
    expect(captura.patches[0].path).toContain(`id=eq.${PERFIL_ALVO.id}`);
    expect(captura.patches[0].path).not.toContain(PERFIL_ADMIN.id);
    await expect(
      page.getByText(/Usuário desativado\. As sessões foram revogadas agora/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('forçar logout chama revoke-auth-sessions com escopo global e o usuário alvo', async ({ page }) => {
    const { captura } = await prepararAdmin(page, 'admin');
    await abrirAdministracao(page);

    const linha = await linhaDoAlvo(page);
    await linha.getByRole('button', { name: 'Forçar logout' }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo.getByText('Forçar logout de Alvo E2E?')).toBeVisible({ timeout: 15_000 });
    await dialogo.getByRole('button', { name: 'Forçar logout' }).click();

    await expect.poll(() => captura.edges.length).toBe(1);
    expect(captura.edges[0].path).toContain('/functions/v1/revoke-auth-sessions');
    expect(captura.edges[0].body).toEqual({ scope: 'global', target_user_id: ALVO_ID });
    await expect(page.getByText(/Sessões de Alvo E2E revogadas/)).toBeVisible({ timeout: 15_000 });
  });

  test('supervisor é barrado na view Administração (portão da navegação)', async ({ page }) => {
    await prepararAdmin(page, 'supervisor');

    const main = page.getByRole('main', { name: 'Conteúdo principal' });
    // O portão vive no ViewRouter: a view nem monta os controles de admin.
    await irPara(page, '/?view=admin', main.getByRole('heading', { name: 'Acesso restrito' }));
    await expect(main.getByText('Seu perfil não tem permissão para acessar esta área.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administração' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /Alterar role de/ })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: /Ativar\/desativar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Adicionar Usuário' })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Alvo E2E/ })).toHaveCount(0);
  });

  test('agente é barrado na view Administração (portão da navegação)', async ({ page }) => {
    await prepararAdmin(page, 'agent');

    const main = page.getByRole('main', { name: 'Conteúdo principal' });
    await irPara(page, '/?view=admin', main.getByRole('heading', { name: 'Acesso restrito' }));
    await expect(main.getByText('Seu perfil não tem permissão para acessar esta área.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administração' })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Alvo E2E/ })).toHaveCount(0);
  });

  test('supervisor é barrado em /admin/* (rota exige admin)', async ({ page }) => {
    await prepararAdmin(page, 'supervisor');

    for (const rota of ['/admin/roles', '/admin/rate-limit']) {
      await irPara(page, rota, page.getByTestId('access-denied'));
      await expect(page).toHaveURL(/\/access-denied/, { timeout: 30_000 });
      await expect(page.getByTestId('access-denied')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Acesso negado')).toBeVisible();
    }
  });

  test('admin atribui role pela tela /admin/roles usando a RPC admin_add_role', async ({ page }) => {
    const { captura } = await prepararAdmin(page, 'admin');
    await irPara(page, '/admin/roles', page.getByRole('heading', { name: 'Roles e Permissões' }));

    await page.getByRole('button', { name: 'Atribuir Role' }).click();
    const dialogo = page.getByRole('dialog');
    // `Novo E2E` é o único perfil sem papel, então é o único ofertado na lista.
    await dialogo.getByRole('combobox', { name: 'Usuário' }).click();
    await page.getByRole('option', { name: 'Novo E2E (novo@test.local)' }).click();
    await dialogo.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Supervisor' }).click();
    await dialogo.getByRole('button', { name: 'Atribuir' }).click();

    await expect.poll(() => captura.rpcs.length).toBe(1);
    expect(captura.rpcs[0]).toEqual({
      nome: 'admin_add_role',
      body: { _user_id: SEM_PAPEL_ID, _role: 'supervisor' },
    });
    await expect(page.getByText('Role adicionada com sucesso')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    // Nenhuma requisição pode ter escapado para o Supabase/Mapbox de verdade.
    // `redeBarrada` é preenchido pelo guarda registrado em `prepararAdmin`.
    const registro = REGISTRO_POR_PAGINA.get(page);
    expect(registro?.redeBarrada ?? []).toEqual([]);
    await page.close();
  });
});

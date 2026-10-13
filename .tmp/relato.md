Especialista: workertestes
Área: worker (testes) — area-testes-do-produto

## O que mudou e por quê
- `e2e/admin-papeis.spec.ts` (novo, 7 testes): o e2e de admin só tinha `a11y-config-admin.spec.ts`. Cobre
  (1) trocar papel pela RPC `admin_set_role`, (2) desativar usuário com `is_active=false` no profile DA LINHA,
  (3) forçar logout via `revoke-auth-sessions` com escopo global e usuário alvo, (4) supervisor barrado na view
  Administração (portão do ViewRouter: heading "Acesso restrito"), (5) agente barrado na mesma view, (6) supervisor
  barrado em `/admin/*` (redireciona para `/access-denied`), (7) admin atribui role pela tela `/admin/roles` com a RPC
  `admin_add_role`. Sessão FALSA (`installFakeSession`), REST/RPC/Edge dublados em `page.route` (a fronteira) — nunca o
  sujeito. Antivacuidade: o `combobox` da linha tem de começar no papel ATUAL antes de trocar, e o `WeakMap`
  `REGISTRO_POR_PAGINA` + `afterEach` reprovam o teste se alguma requisição real escapar (`redeBarrada` vazio).
- `playwright.config.ts`: projeto novo `chromium-admin` (`testMatch: admin-papeis`) com `storageState` VAZIO explícito, e
  `admin-papeis\.spec\.ts` somado ao `testIgnore` do projeto base — sem isso o spec rodaria duas vezes. É config de
  teste, não código de produção.
- `supabase/functions/approve-password-reset/index.test.ts`: NÃO escrevi de novo — ele JÁ EXISTE no workspace, veio no
  commit `39fa1b79a` (`git merge-base --is-ancestor 39fa1b79a HEAD` verdade) e já cobre os 4 casos pedidos: papel
  (supervisor 403), status (já processada 409), aprovação dupla / auto-aprovação (403) e resposta sem link
  ("admin aprova: e-mail sai pelo GoTrue e a resposta NÃO traz link"), mais 401/429/origem canônica. Reescrever seria
  devolver o que a V2 já faz.

## Dependência (faixa do cartão pai, t_7055f245)
- O diff contra a base do dia traz também `src/integrations/supabase/types.ts`,
  `supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql` e `supabase/tests/user_roles_add_remove_role.sql`:
  são do cartão PAI (commit `0b764774c` e a faixa `94b81c2e5` + `7d9004a3e`), que estava `done` mas NÃO integrado —
  trouxe por cherry-pick porque sem as RPCs `admin_add_role`/`admin_remove_role` o meu teste 7 não teria o que provar.
  Não editei nenhum desses três; os commits meus são só o spec novo e o `playwright.config.ts`.

## Prova
- Vermelho antes (mutação 1 — revertida SÓ a produção do cartão pai):
  `git checkout 0b764774c^ -- src/pages/admin/useRolesPageState.ts` (volta o INSERT/DELETE direto em `user_roles`) →
  `bun run test:e2e -- --project=chromium-admin --grep admin_add_role` → `1 failed` em
  `expect(captura.rpcs[0]).toEqual({...})` (spec linha 299). Restaurado com `git checkout HEAD -- <arquivo>`.
- Vermelho antes (mutação 2): `supabase.rpc('admin_set_role_MUTACAO', ...)` em
  `src/components/admin/useAdminData.ts` → `bun run test:e2e -- --project=chromium-admin --grep admin_set_role` →
  `1 failed` em `expect(captura.rpcs[0]).toEqual({...})` (spec linha 204). Restaurado com `git checkout HEAD -- <arquivo>`;
  `git status` limpo depois das duas.
- Verde depois (estabilidade, 3 rodadas): `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5193 bun run test:e2e --
  --project=chromium-admin --workers=1 --repeat-each=3 --reporter=line` → `21 passed (6.0m)` (7 testes × 3, zero falha).
- Deno (3 rodadas): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
  supabase/functions/approve-password-reset/index.test.ts` → `ok | 9 passed | 0 failed` nas três.
- Validadores do CI que olham o `playwright.config.ts`: `node scripts/ci/ci-e2e-projects.unit.mjs` → `pass 9, fail 0`;
  `node scripts/ci/playwright-config-e81.unit.mjs` → `pass 6, fail 0`.
- Verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (`db_guard`, `tipos`, `lint`, `migrations` OK).

## O que NÃO fiz e por quê
- Nenhuma linha de código de produção foi alterada (o cartão proíbe): as duas mutações acima foram desfeitas e o diff
  do cartão tem só o spec novo, o `playwright.config.ts` e este `.tmp/relato.md` (documento, não código).
- Servidor de teste: subi o MEU Vite em `127.0.0.1:5193` (`--strictPort`) porque a porta padrão pode ser de outro
  workspace (`reuseExistingServer`) — testar o servidor alheio mediria o código errado.
- Sob carga alta da máquina (load ~70) o guard de montagem de 8 s do app ("Falha ao inicializar o app") apareceu 2×
  antes; por isso tirei o `beforeAll` de aquecimento do spec (o hook de 30 s estourava e derrubava teste que passa) e o
  helper `irPara` recarrega a página quando vê esse guard, que é ruído de infra. Nenhum timeout de asserção foi
  afrouxado e nenhum teste foi pulado.
- `node scripts/ci/check-test-inventory.mjs` acusa 6 `.test.sh` órfãos em `scripts/db-audit/` — estado pré-existente,
  fora do meu diff (banco é do worker (sql)).

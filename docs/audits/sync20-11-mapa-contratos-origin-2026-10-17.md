# Mapa: contratos/E2E origin-only → artefato de produção que falta → dono → lote

Data: 2026-10-17. Escopo do cartão `t_00ad26bc` (worker/testes), branch
`v2/sync20-11-testes-contracts-e2e-origin-on-261017100048c5`.

Origem dos dados: `git ls-tree`/`git diff --name-status` entre a árvore do dia e
`origin/main` (blob de referência `a9b4d6c6fb35625e8a4794895f733ce696201b28`).
Todos os arquivos abaixo são `origin_only`: existem em `origin/main`
(2026-10-16 18:59, commit `025d0258dc` — lote 880 cartões / PR #1976) e **não**
existem na árvore do dia. Contagens medidas: 6 contratos + 4 specs E2E
(+ 1 PNG de screenshot em `e2e/__screenshots__/`).

## Por que este mapa existe

Os 6 contratos foram resgatados e **medidos** numa execução anterior do cartão,
mas só 1 deles roda verde contra a árvore do dia sem trazer o artefato de
produção junto:

- `warroom-rpcs-params` é verde porque curto-circuita sem banco local
  (`if (!TEM_BANCO) return;`) — **resgatado neste cartão** (byte-idêntico à
  origin) e provado verde.
- Os outros 5 **leem/afirmam artefatos de produção que ainda não existem no
  dia** (migrations, `types.ts`, handler de Edge, remoção do módulo Clássicas).
  Resgatá-los agora é adicionar teste vermelho, não entrega. Ficam mapeados aqui
  e entram no lote em que o artefato de produção entra.

Regra de resgate (senior, `t_00ad26bc`): só entra o contrato verde medido agora;
os demais não entram como teste — entram como este mapa.

## Contratos (`tests/contracts/`)

| Contrato | Artefato de produção que falta no dia | Dono | Lote em que entra |
|---|---|---|---|
| `warroom-rpcs-params.contract.test.ts` | RPCs `warroom_agent_today(p_date?)` / `warroom_queue_stats()` no banco local + `types.ts` (o teste curto-circuita sem banco) | worker(sql) — migration; worker(testes) — arquivo do teste | **RESGATADO agora** (blob origin `aa14cd98…`, byte-idêntico) |
| `admin-cron-jobs-rpc.contract.test.ts` | migration com `admin_list_cron_jobs` / `admin_toggle_cron_job` (SECURITY DEFINER, allow-list única, `cron.alter_job`, auditoria) + `types.ts` + registro no db-guard | worker(sql) | lote `025d0258dc` (PR #1976) — quando o artefato de DB entrar no dia |
| `departments-admin-management.contract.test.ts` | RPCs de gestão de departamentos (guarda de papel, `search_path`, EXECUTE revogado, `audit_logs`) + `src/integrations/supabase/types.ts` + registro no db-guard | worker(sql) — SQL/types; worker(hooks) se o caminho for hook | lote `025d0258dc` |
| `evolution-presence-status.contract.test.ts` | handler da Edge `evolution` gravando `presence_status`/`presence_updated_at` (online/offline; não toca `last_seen_at`) | worker(edge) | lote `025d0258dc` |
| `no-campaigns-classicas.contract.test.ts` | remoção real do módulo "Campanhas Clássicas" (nav, rota/lazy, `COMPLETE_SYSTEM_FEATURES`) | worker(telas) | lote `025d0258dc` |
| `notification-permission-gesto.contract.test.ts` | permissão de notificação pedida SÓ no clique do painel (nenhuma porta automática) | worker(auth)/worker(telas) | lote `025d0258dc` |

## E2E (`e2e/`)

| Spec | Precede / depende de (produção) | Dono | Lote |
|---|---|---|---|
| `a11y-inbox-teams.spec.ts` | tela Inbox/Teams + landmarks acessíveis | worker(telas) | `025d0258dc` |
| `a11y-toque-44px.spec.ts` | alvos de toque ≥ 44px nos controles | worker(telas) | `025d0258dc` |
| `monitoring.spec.ts` | tela de monitoramento | worker(telas) | `025d0258dc` |
| `team-chat.spec.ts` | chat de equipe | worker(telas) | `025d0258dc` |
| `__screenshots__/security-acl-alerts-light-linux.png` | baseline visual (só faz sentido com a tela acima) | worker(telas) | `025d0258dc` |

## Limite

Nenhum destes entra por resgate cego: cada um exige o artefato de produção
correspondente para poder rodar verde. Este mapa é informativo — não autoriza
nenhum merge/push; a integração é do integrador.

## Prova deste cartão

- `tests/contracts/warroom-rpcs-params.contract.test.ts` copiado byte-idêntico de
  `origin/main` (`diff` vazio) e roda **verde**: `Test Files 1 passed (1)` /
  `Tests 5 passed (5)` em `vitest.contracts.config.ts`.

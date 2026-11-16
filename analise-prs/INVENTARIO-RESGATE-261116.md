# Inventário do que existe só em branch — 16/11/2026

`main` de referência: `75fbec3bad8785d6b239bf73adb7ec5a139fbb44`.
Todo veredito abaixo tem evidência de comando, `arquivo:linha` ou consulta ao banco oficial
(`tnnnlkbymytvtqngbbqh`, somente leitura).

## 0. Correção de método (leia antes de confiar em varredura antiga)

O clone de sessão vinha **shallow** (`git rev-parse --is-shallow-repository` → `true`), e nesse estado
`git merge-base origin/main origin/<B>` **falha para 274 das 293 branches**. Um critério que capture o
stderr do git dentro da lista de arquivos (`files=$(git diff ... 2>&1)`) transforma `fatal: ... no merge
base` em pathspec que não casa com nada e devolve "0 pendências" — classificando como "descarte seguro"
branch que nunca foi avaliada. Foi o que aconteceu com o número **275** que circulou nesta sessão: é falso.

Critério válido: `git fetch --unshallow` primeiro; abortar quando o `merge-base` falhar; `--no-renames`;
`$files` por `-z`, nunca por word-splitting; e testar ausência com `git rev-parse --quiet --verify`
(sem `--verify`, o git imprime o próprio argumento e o teste de "ausente" nunca dispara).

Resultado com histórico completo: **99 branches** têm pelo menos um arquivo que não existe na `main`;
**79** têm código (não só relatório); **182 pares** branch/arquivo auditados um a um.

**A lista de 182 ainda está incompleta.** O filtro por diretório cortou 7 arquivos que também faltam na
`main`: `src/components/inbox/ContactPurchasesPanel.tsx`, `src/hooks/crm/useContactPurchases.ts`,
`src/hooks/crm/__tests__/useContactPurchases.test.tsx`, `src/components/contacts/ContactPurchaseHistory.tsx`,
`src/components/inbox/tabs/SalesViewTab.tsx`, `src/components/calls/VoIPPanel.tsx`,
`src/components/campaigns/CampaignsView.tsx`. Refazer sem o filtro.

## 1. Nada foi apagado

Nenhuma branch e nenhuma tag foram removidas nesta sessão. As branches que o painel adversarial liberou
para descarte (porque o trabalho está na `main` por outro caminho) seguem no repositório — a exclusão é
decisão do dono, e o inventário abaixo é o que ela precisa.

## 2. Banco: o que falta de verdade (54 arquivos `supabase/` auditados)

Contexto que pesa: o copiloto está **ligado** em produção (`feature_flags` → `ai.capability.copilot_live
= true`, 112 linhas em `copilot_sessions`, 611 em `copilot_insights`).

| prioridade | o que falta | onde está | risco de aplicar |
|---|---|---|---|
| 1 | 6 policies de RLS do supervisor | PR #3158 (`20261115040000`) | baixo — as 3 tabelas têm 0 linhas |
| 2 | RPC `commit_copilot_tick` | PR #3160 (`20261115030000`) | baixo — função nova, grant só service_role |
| 3 | tabela `copilot_presence` + `upsert_copilot_presence` | `claude/feat-copilot-radar-20261108-1800` | baixo — tabela nova com RLS |
| 4 | `copilot_retention_aggregates` + `run_copilot_retention` | idem | baixo-médio — só agrega, não apaga |
| 5 | índice de `cron.job_run_details` + advisory lock do tick Talk X | `claude/fix-talkx-cron-startup-timeout-261101-2200` | médio — toca schema `cron` |
| 6 | RPC `e2e_fixture_message` | `claude/fix-ga-fase0-banco-e2e-261020-2200` | médio — SECURITY DEFINER que insere em `messages` |
| 7 | suíte de regressão de `mark_pause_investigated` | `claude/infra-c121-ddl-261101-1350` | nenhum — roda em Postgres descartável |

Sem o item 1, o pedido de ajuda ao supervisor é gravado e **ninguém consegue ler**, e qualquer vendedor
pontua a conversa de qualquer colega. Sem o item 2, o tick avança o cursor mesmo quando a gravação dos
insights falha — análise paga que não volta.

O resto dos 54 é `SUPERSEDIDA`, `JÁ-NA-MAIN-RENOMEADA` ou `APLICADA-NO-BANCO`. Dois casos a registrar:
`20261016250000` da branch `claude_pink/cool-dijkstra-xk9ek2` **colide** com version já no ledger
(`revoke_anon_write_grants_all_tables`) e nunca pode ser aplicada com esse número; e a variante
`20261016193500_copilot_retention.sql` é expurgo LGPD destrutivo (DELETE de insights > 90 d) — decisão do
dono, não aplicar junto com a de agregação.

## 3. Front: features integradas que ficaram fora da `main` (56 arquivos `src/` auditados)

| prioridade | o que o usuário não tem | branch | estado na branch |
|---|---|---|---|
| 1 | importar biblioteca de templates do Talk X (CSV/JSON com conflito) | `claude_juca/practical-rubin-8xnw0u` | integrado (`TalkXTemplates.tsx` importa) |
| 2 | aba Vendas do atendimento: registrar compras/propostas do contato | `claude/fix-logger-vitest-mock-261017-1000` (melhor versão) | integrado — **mas a tabela `contact_purchases` não existe em produção** (`42P01`) |
| 3 | ações em massa na Visão geral do Talk X | `claude_juca/practical-rubin-8xnw0u` | integrado; hoje a main deixa marcar campanha e **nenhuma ação aparece** |
| 4 | painel "Status dos serviços" do Talk X | `claude/feat-talkx-x048-estados-servico-261101-2100` | integrado; hoje o botão existe em `kit/states.tsx:175` e **nenhuma tela passa `onViewStatus`** |
| 5 | robustez de a11y nos primitivos (`TableHead` sem `scope`, diálogo sem descrição, sparkline anunciado) | `hermes/robustez-primitivos-ui-...` | só os casos (a), (d), (e), (f); (c) e (g) já superados |
| 6 | texto longo não quebrar Badge/Card/Label/Tabs | `claude/feat-ui-visual-texto-longo-261101-1445` | precisa das mudanças nos primitivos juntas (`card.tsx:97` ainda em `leading-none`) |

Superado com evidência, para ninguém re-resgatar: `useMotionSeguro` (a `main` resolve
`prefers-reduced-motion` globalmente em `src/App.tsx:83-89` com `<MotionConfig reducedMotion="user">`),
`VoIPPanel.test.tsx` (virou `TelefoniaView.painel.test.tsx`), `RadarPhase6Panel` (virou
`inbox/copilot/RadarPanel.tsx`), `useCopilotSession` de `hooks/chat/` (virou `hooks/copilot/`).

A branch `claude_pink/nice-hypatia-iikl82` é o contrário de trabalho perdido: ela **substitui**
implementações da `main` por stubs (`ConnectionsView.tsx` de 287 → 73 linhas, perdendo QR code e trava
de multiconexão). Não resgatar.

## 4. CI e guards: 22 pendências reais (72 arquivos auditados)

As três que valem pelo risco que seguram:

1. **Gate 3 do types-sync está furado.** `.github/workflows/types-sync.yml:485` compara
   `supabase/schema-catalog.json` (já sobrescrito no passo anterior) com `/tmp/catalog.new.json` — o
   arquivo com ele mesmo. O único freio contra um sync que apaga objeto ainda usado pelo `src/` **sempre
   passa**. O teste que pega isso está em `claude/fix-ga-resto-typessync-20261021-0730`
   (`scripts/ci/ga20-ga25-contratos.unit.mjs`), mas o que resolve é a fiação no YAML.
2. **Nenhum guard de Dockerfile.** `.github/toolchain.json` diz `"go": "1.24.x"` e
   `infrastructure/preview-egress-proxy/Dockerfile:1` usa `golang:1.27-alpine` — 3 minors à frente, sem
   ninguém reclamando. O guard está em `claude/fix-ga-fase78-perimetro-custo-261020-2200`
   (`scripts/ci/docker-pins.unit.mjs`, 51 linhas). **Ao entrar ele fica vermelho**, expondo a divergência:
   decidir junto se alinha o Dockerfile ou sobe o toolchain.
3. **Edge que lê variável nunca configurada só quebra em produção.** `scripts/ci/check-edge-envs.mjs` +
   baseline de 49 nomes (`claude_pink/cool-dijkstra-xk9ek2`); a `main` só confere os 7 secrets que o deploy
   reescreve (`scripts/edge-deploy/secrets-scope.mjs`). O baseline é de 20/10 e precisa ser regerado antes
   de entrar.

Removido de propósito, não resgatar: `auto-update-pr-branch.yml` e `scripts/ci/fila-merge.mjs`
(desativados à mão pelo dono em 11/11 após 8.312 runs, commit `35bb4cba5`), `scorecard.yml`,
`vercel-env-cleanup.yml` (removido por engano em 14/11 e **restaurado no mesmo dia** — o cabeçalho do
arquivo na `main` explica: 7 segredos de servidor na Vercel mantêm a limpeza pendente).

Lixo: as 17 fixtures `e2e/fixtures/talkx-demo/tela-NN.json` são `{}` de 3 bytes; as fixtures reais, com o
nome final, já estão na `main`.

**Ressalva de escopo:** 7 das 22 pendências de CI **não funcionam sozinhas** — dependem de hunks em
`.github/workflows/{db-migrate,types-sync,db-live-guard,db-guard}.yml`, que existem na `main` e por isso
ficaram fora da lista de "ausentes". Resgatar só o script produz CI vermelha ou guard morto.

## 5. Achado de segurança, fora do escopo desta varredura

`.github/workflows/vercel-env-cleanup.yml` na `main` registra, medido na API da Vercel em 14/11: das 20
variáveis do projeto, 12 estão na lista de remoção e **7 são segredo de servidor no target preview** —
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`,
`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`. O `AGENTS.md` proíbe segredo de
servidor na Vercel. Não confirmei o estado atual nesta sessão (a conta pessoal não lista o projeto;
ele está sob o time `juca1`).

## 6. Ruído de CI

- 4 check suites ficam eternamente `queued` com 0 runs em todo head novo: apps `claude`, `cursor`,
  `devin-ai-integration`, `promo-gifts-v4`. Se algum desses contextos entrar nos required checks, nenhuma
  PR mergeia.
- `Supabase Preview` sai `FAILURE` nas PRs com migration (projeto de preview `bcaftxzkgaxyjqtltwyh`, que
  não é o oficial). Não é required.

## 7. Incidente de merge do GitHub (16/11, ~12:39 às 13:30 UTC)

`PUT /pulls/<n>/merge`, `POST /merges`, a mutation GraphQL `mergePullRequest` e o `PUT /update-branch`
devolveram **502** para as PRs #3164, #3166, #3167 e #3169; depois da primeira tentativa cada uma passou a
responder `405 Merge already in progress` — JSON do GitHub, que só existe quando ele tomou o lock de merge
da PR e o job não concluiu. Descartados com evidência: rulesets (vazios), check pendente
(`/commits/<sha>/status` = success), rate limit (4935/5000), tamanho do repositório e o proxy do contêiner.

O que funciona nesse estado, e virou receita:

1. `enablePullRequestAutoMerge(SQUASH)` — assíncrono, não depende da resposta síncrona. Foi assim que a
   #3168 e a #3170 entraram.
2. Se a PR já está presa pelo lock e `BEHIND`: **branch nova a partir da `main` atual montada com os blobs
   que já estão no servidor** (`create_tree` + `create_commit` + `create_ref`, todos funcionando), e PR
   nova. Zero reenvio de conteúdo, zero risco de transcrição — e dá para provar byte a byte comparando o
   `oid` do blob publicado com o `git hash-object` local.

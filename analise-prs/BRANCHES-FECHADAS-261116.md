# Branches fechadas em 16/11/2026 — registro com SHA para restauração

Sessão `session_01N1ArYPVtJ9CutqjaJRoe4a`. Regra do dono: **só se apaga o que tem certeza absoluta,
byte a byte, de já estar na `main` ou de ter ficado realmente obsoleto.** Este arquivo é o recibo:
cada branch apagada aparece abaixo com o SHA do seu último commit e a prova do veredito.

Restaurar qualquer uma é um comando — o objeto continua no repositório:

```bash
git push origin <SHA>:refs/heads/<nome-da-branch>
```

## Como o veredito foi fechado

Três critérios, aplicados nesta ordem, contra a `main` de hoje:

1. **Blob idêntico (prova byte a byte)** — todo arquivo que a branch adiciona ou altera tem o
   mesmo hash de blob de um arquivo da `main`, em qualquer caminho. Independe de o arquivo ter sido
   movido (foi o caso da auditoria, que entrou na `main` sob `docs/_arquivo/`).
2. **Contenção de linha** — para arquivo que existe nos dois lados com conteúdo diferente, toda
   linha adicionada pela branch tem de existir na versão da `main`.
3. **Adjudicação individual** — as branches com uma ou duas linhas sobrando foram abertas uma por
   uma e a linha exata foi procurada na `main`. O que sobrou é comentário, número de linha em doc,
   hash de artefato gerado ou configuração que a `main` redecidiu depois.

A prova por "PR mergeada" **não serve neste repositório**: das 295 branches remotas, 264 tiveram a
PR fechada sem merge — as que foram mergeadas tiveram a branch apagada na hora. Por isso tudo aqui é
comparação de conteúdo, não de estado de PR.

## O que foi apagado

| Branch | SHA do tip | Prova |
|---|---|---|
| `Github_Copilotauditorias-anteriores-reconciliacao` | `141d30b34a1099c5a559b06bdb8161622831c54b` | gate v2: todo blob da branch existe na main |
| `chore/analise-prs-261024-2325` | `1c871e471dc8eb36be4085beae833b7b9105c155` | gate v2: todo blob da branch existe na main |
| `claude/auditoria-temp-261101` | `f258d5acf83cf1e8d571f1a640e04e18d35447a7` | gate v2: todo blob da branch existe na main |
| `claude/br-dossies-lote4-261031` | `01fff64d1d2e1b7c6033861e749f755ac65a512b` | gate v2: todo blob da branch existe na main |
| `claude/chore-auditoria-supabase-final-251025-1655` | `f5d52460776273582e6751721af68a4561b052c2` | gate v2: todo blob da branch existe na main |
| `claude/chore-prod-readiness-261112-1421` | `dc3424ee5ec4e9c445039b4d8df2bba6e01435dc` | gate v2: todo blob da branch existe na main |
| `claude/chore-relatorio-ci-261112-0940` | `5c655b681b72bd7d00e3ee6183725c2b59739f49` | gate v2: todo blob da branch existe na main |
| `claude/docs-handoff-261116-1220` | `e7e5ace37e6e68d523c9c4c4b73f224c5b337505` | gate v2 + PR #3166; conteudo na main |
| `claude/feat-copilot-tick-transacao-261116-0115` | `04cab21934d33935ce02978d1032d3d621164208` | gate v2; DDL commit_copilot_tick aplicado em producao via PR #3173 |
| `claude/feat-copiloto-fases13-15-ddl-261024-1530` | `0072cc1d1c56f0fe702c429f017c4185e0430b30` | gate v2: todo blob da branch existe na main |
| `claude/feat-radar-migration-261101-1550` | `0789ca73448e9ee7415a1f573fc6af39a50e97b3` | gate v2: todo blob da branch existe na main |
| `claude/fix-ci-workflows-261030-0830` | `1a8c80963dc67f201570fc7e23b5b9ae650cb830` | gate v2: todo blob da branch existe na main |
| `claude/fix-console-typing-closed-261112` | `43c34c85e3b80f989708b727ded202e6423e5a2d` | gate v2 (mesmo caminho, byte identico) |
| `claude/fix-copilot-rls-supervisor-261116-0105` | `3fc22c0507bc3fd08f0776e772da0861f65ba718` | gate v2; policies is_admin_or_supervisor em producao via PR #3173 |
| `claude/fix-pins-playwright-deps-261116-1300` | `dff0e2d0ef67d01b649cebfb691c6c092c1b20d0` | gate v2 + PR #3169 reconstruida e mergeada |
| `claude/fix-plano-190-etapas-261019-1200` | `108128f371cb945fb4b99f2a99d465ae85fe1764` | gate v2: todo blob da branch existe na main |
| `claude/test-resgate-suites-orfas-261116-1520` | `50b964178ffa4fe32774f511840bf2a206dd9144` | PR #3176 MERGEADA; gate v2 limpo |
| `claude/test-talkx-rascunho-nao-remonta-261116-1255` | `2974e7e6401fec9fbff2fd06b43c141abfa6c140` | gate v2; suite entrou pela PR #3167 |
| `fix/contacts-race-condition-useLayoutEffect` | `178a79cbb2868a16c58a0c4e42669b8d75ffd3c7` | gate v2: todo blob da branch existe na main |
| `claude/chore-claude-md-required-checks-261101-1600` | `a38e2ad400ce6482aecfcd5320bff128a926ad48` | unica pendencia: texto de required checks no CLAUDE.md; a main carrega a versao canonica mais nova |
| `claude/fix-claude-md-gr011-261102-0100` | `631d210e32f54b4cae4aa08690ec1033f38b66a2` | idem: texto de required checks superado pelo CLAUDE.md da main |
| `claude/fix-gr011-required-checks-311031` | `ebc6956fbd60fc61b7688dd55cff5f63dd552d84` | idem: texto de required checks superado pelo CLAUDE.md da main |
| `claude/chore-sync-catalog-grants-baseline-261107-1354` | `e30d4ca0816a78ba6208743b5259095dc96d1624` | unica pendencia: snapshot grants-baseline.json de 07/11; a main tem baseline mais novo |
| `claude/ci-deploy-functions-build-id-261114-0017` | `801b605aab3b9007212de66294ea434e272ce250` | unica pendencia: 1 linha de comentario no deploy-functions.yml |
| `claude/feat-talkx-relatorio-concluida-261112-1158` | `331ceb96ff09f371fbaf575ab8c7d8ef6d47154f` | unica pendencia: 1 linha de tabela com numeros de linha em docs/talkx/ESTADOS.md |
| `claude/fix-console-gmail-409-261112` | `3e4a44373f35976ba60a09af75fb57c67e179495` | unica pendencia: manifest_sha256 de supabase/deployment-manifest.json (artefato gerado) |
| `claude/fix-gmail-409-integra-261113-1102` | `a15b724b917890b4b35771d142d26708d803f537` | unica pendencia: manifest_sha256 de supabase/deployment-manifest.json (artefato gerado) |
| `claude/fix-gmail-oauth-token-expose-20261108-1900` | `6c4610ef767902f64768a91167fa53e4b835de76` | o fix de seguranca esta na main (gmail-oauth/index.ts:264 devolve so expires_at); faltam 2 comentarios |
| `claude/fix-E71-draft-skip-security-e2e-261101-1200` | `3f388654595156660cc5512e746dca604bee9227` | pula-draft esta na main (.github/workflows/ci.yml, 7 ocorrencias de draft); faltam 4 comentarios |
| `claude/fix-deno-check-config-261102-0630` | `cee44e042790165e7acbc8e60f6875723b9b6e24` | superado: supabase/functions/deno.json da main tem nodeModulesDir, a flag do workflow virou desnecessaria |
| `claude/fix-deploy-deno-check-node-modules-261030-1200` | `ea3af3e1e62df2b23b88384978b608b275b243ea` | idem: nodeModulesDir no deno.json da main dispensa --node-modules-dir |
| `claude/fix-deno-modules-dir-261102-0450` | `38656b5a06e639730c2974e614e60eb3d1c8f8d2` | idem: deno.json da main ja tem nodeModulesDir |
| `claude/fix-e2e-workers-ci-timeout-271027-0924` | `c2055dff93ae93eaeea6c6a9625a22d1b2e1c980` | superado: a main redecidiu workers no playwright.config.ts depois desta branch |
| `claude/fix-talkx-report-empty-suite-261108-2125` | `97732853d043a0d49ef54309551c192595999f1c` | stub it.todo; a main tem a suite real de TalkXCampaignReport (0 it.todo) |
| `claude/fix-talkx-report-test-stub-20261108-2210` | `be0a4f5dac2d16521d9ce3240e370b2f490cf14c` | placeholder; a main tem a suite real de TalkXCampaignReport |
| `claude/fix-talkxcampaignreport-test-261109-0454` | `291fe3f5ffd3626dec8c612f24b8cfb19f635ac2` | it.todo; a main tem a suite real de TalkXCampaignReport |
| `claude/fix-talkxcampaignreport-tests-261109-0400` | `2a4c9437477e841576b8de48c461d514ccf67dc0` | rascunho; a main tem a suite real de TalkXCampaignReport |
| `claude/feat-x051-talkx-lifecycle-2611081915` | `bbdf443d4ffd5975fa8f409d52e44d8674cb7c0f` | useTalkXLifecycle esta no TalkXCampaignRunning.tsx da main (3 ocorrencias) |
| `claude/fix-talkx-command-cache-261108-2320` | `d64b521fe3f3d722753fc0abf85706d9884b5af5` | queryKeys *-palette estao em useTalkXCommandItems.ts da main (7 ocorrencias) |
| `claude/fix-team-chat-deeplink-261108-1932` | `eb15216f38a5c011440f92cd15f12eb3b9201b9e` | deepLinkCid esta no TeamChatView.tsx da main (5 ocorrencias) |
| `claude/fix-esm-sh-regression-261108-2320` | `db7fc3750c46250d857db176dc31297fe048415f` | codigos PGRST116/42501 estao no external-db-proxy da main; o pin de supabase-js da main e mais novo |
| `claude/feat-radar-panels-8to15-261108-1906` | `5472e47682ae8c147178f9a3923e7ae9faab0158` | painel RADAR esta no ChatInputArea.tsx da main (4 ocorrencias); faltam 1 comentario e 1 className |
| `claude/fix-multiplix-retomar-seguro-261114` | `941d989d23a9d8674c6dbba3d3ec8af85f483472` | resumeDispatch esta no MultiplixMonitor.tsx da main; resto e manifest gerado |
| `claude_pink/pensive-keller-kjgdal` | `e835093085ff5a21cc4f28891ae05f81443d46be` | o regex de scripts/ai-context/gerar.mjs esta na main |
| `codex/fix-lint-phone-settings-20261101` | `b46eabe4279840549ce47ba3b42e07422e897d20` | o aria-label de QueueAlertsDisplay.tsx esta na main |
| `claude/fix-eslint-no-secret-compare-261110-2350` | `847ffd1c49c457a32a94c68971c727070e2e49f1` | o onKeyDown de TalkXSegments.tsx esta na main |
| `claude/fix-department-invites-rls-261114-1200` | `14a17d19d76e04e38f4177c86b3e57c2320d6c63` | o teste department-invites-select-admin-only.test.sh esta na main |
| `claude/fix-grants-baseline-pos-2822-261111` | `d27cb593e2961b21ddc24b2b4ff5fc5e021d7814` | o REVOKE de mark_pause_investigated esta em supabase/migrations/20261111181000 da main |
| `claude_04/intelligent-babbage-bo2g5s` | `1adaffb06d53952388350f7bcd032baf9d2949ab` | superado: a main usa AUTH_LOGIN_TIMEOUT_MS=30_000, mais folgado que os 25_000 da branch |
| `claude/fix-known-violations-copilot-feedback-261023-2035` | `61f88092ffed13c1988478369418dfd10b138bdd` | unica pendencia e uma entrada de allowlist em known-violations.json que a main deliberadamente nao tem |
| `claude/project-thread-lrbsuz` | `3ff941d8ced40bda2c448586c8450bdd1961ec1e` | unica pendencia: lista de metodos num builder de teste cujo arquivo esta na main |
| `claude/fix-n011-dinamico-261021-0759` | `77de63cb91d153eb21e9909228483c5013d132e7` | unica pendencia: comentarios num teste que esta na main |
| `claude/fix-copilot-brinde-state-261101-1500` | `bbccc427fd38446d07ef4cbcc5519065e693728e` | unica pendencia: comentarios numa migration ja aplicada |
| `claude/chore-testes-edges-261112-1202` | `62a75e9a49fea34199c1ac2bbd0c4cf50887a2a7` | 3 linhas em testes de edge que existem na main |
| `claude/feat-metas-seletor-periodo-261101-1208` | `de9584f20314ff94438b8cd5f007a7f6aadf19a8` | 3 linhas no teste GoalsDashboard, que esta na main |
| `claude/docs-g9-absorb-261019-1300` | `f1b53effaa4da01f3e4a9b8be870af00426a6275` | 1 linha num plano de docs |
| `claude/fix-z022-z024-dbguard-ci-261018-1930` | `f0b5b7cd2659132b552b912d60a91f0bb1172d4d` | superado: os pins do Playwright 1.65.0 da main substituiram esses install |
| `claude/chore-docs-relatorio-261112-0910` | `47980f8132c2aebb7227ea4726da9cf351145591` | RELATORIO_CI.md e relatorio datado, superado |
| `claude/chore-relatorio-ci-261112-0803` | `47bdaa7fd6ac222746cae6862a40c20c642e2657` | RELATORIO_CI.md e relatorio datado, superado |
| `claude/br-dossies-lote1-261031` | `27835467776dcbe41d86cf9458d0157fddffea80` | analise/progresso.json superado pelo INVENTARIO-RESGATE-FINAL |
| `claude/br-dossies-lote2-261031` | `599e60294fee02931e7472339c8f70491c433d04` | analise/progresso.json superado pelo INVENTARIO-RESGATE-FINAL |
| `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` | `0fd17f8d148e1c697498d1ed4fcff96126f9b4ac` | abandonada com erro de sintaxe no proprio patch (waitFor('() =>, creen.getByRole) |
| `fix/f1a-framer-motion-mock-voicechangerpicker-20261018` | `3f8ee72f36dc12ae219d980c0bf99eec45cc651f` | 4 linhas de mock num teste que esta na main |
| `fix/f1a-lote-b-admin-audit-page-size` | `b6faf77361235bb6d5c48933c6f9e7fb5e38acc0` | 1 assert num teste que esta na main |
| `fix/f1a-lote-b-hooks-misc-1` | `ff66b4565275a4b77825706a49894ebc97aafd5c` | comentarios em useScreenProtection.ts, que esta na main |

## O que NÃO foi apagado, e por quê

### Trabalho real de outro agente que ainda falta na `main` (achado nesta rodada)

| Branch | O que falta | Evidência |
|---|---|---|
| `claude/fix-health-check-414-261109-2011` e `claude/fix-healthcheck-http414-261109-1900` | tratar HTTP 414 como erro transitório no health-check das edges | `scripts/edge-deploy/health-check.mjs:193` da `main` só trata `>= 500` |
| `claude/fix-typecheck-suppression-261019-1342` e `claude/fix-typecheck-suppression-261023-2230` | o tipo `SuppressionReasonCode` e a tipagem de `reason_code` | `src/hooks/integrations/useTalkXSuppression.ts` da `main` só menciona `reason_code` em comentário |
| `claude/fix-unit-tests-inbox-261023-1108` | `clientWidth`/`clientHeight` no jsdom para o `@tanstack/virtual-core` ≥ 3.19 | `src/test/setup.ts` da `main` não define nenhum dos dois |
| `claude/fix-e2e-talkx-ajuda-ctrlk-261113-1629` | o `blur()` que tira a corrida do Ctrl+K da Ajuda no WebKit | `e2e/talkx.spec.ts` da `main` tem `Control+k` nas linhas 114 e 126, sem `blur` |

### Pendente de decisão do dono

- `claude/feat-copilot-radar-20261108-1800` — `copilot_presence` (tabela + RPC + 2 policies + 2
  índices) não existe na `main` nem em produção e não tem consumidor em nenhum lugar.
- `claude/wizardly-ride-dimxnt` — propõe remover `vercel-env-cleanup.yml`, que a `main` restaurou de
  propósito em 14/11. Decisão de infra.
- `claude/loving-lovelace-esc3l2` — os documentos já entraram na `main` em
  `docs/_arquivo/auditoria-supabase-261022/`, mas a branch ainda carrega migrations de proposta que
  não foram aplicadas.
- `claude/chore-cmd-auditoria-supabase-261101-1430` — `.claude/commands/auditoria-supabase.md` não
  existe na `main`; é ferramenta de agente, não código morto.

### Em andamento ou geradas por automação

`automation/types-sync`, `automation/inventario-estado`, `contexto`,
`claude/feat-talkx-resgate-templates-261116-1510` (PR #3175),
`claude/fix-e2e-firefox-trace-261116-1620` (PR #3182) e a branch do Dependabot.

### As demais

As outras branches seguem abertas porque têm conteúdo que não passou nos três critérios — na maioria
migrations que nunca foram aplicadas e arquivos de teste de features que não entraram. Estão
inventariadas em `analise-prs/INVENTARIO-RESGATE-FINAL-261116.md`, com branch e caminho, para
voltarem junto com a feature se ela voltar.

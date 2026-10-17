# Decisão SYNC22 — Direção do merge por área + lotes (F04, a partir do par OURS/THEIRS)

Data: 2026-10-17. Cartão: SYNC20-22 F04 (THEIRS + matriz, sem decisão global).
Base: `dia/2026-10-17` = `d723a90107`, `origin/main` = `a9b4d6c6fb`, merge-base `7a15852791`.
Método: 100% local e sem escrita nas branches (`git merge-tree`, `git archive` em
`.tmp/sync20-22/theirs`). Nenhum push, merge, migration ou toque em produção.

Doc-irmão (premissa): `docs/DECISAO-INTEGRACAO-DIA-NA-MAIN-F04-2026-10-17.md`
(SYNC20-21: 578 conflitos, protótipo OURS, decisão MERGE-não-rebase).

## 1. Árvores reproduzidas (OIDs cheios, byte a byte)

| Variante | Comando | Árvore cheia |
|---|---|---|
| OURS (vence a dia) | `git merge-tree --write-tree --merge-base=7a15852791 -X ours d723a90107 a9b4d6c6fb` | `d93bc10ea7513844336699e679398666192a7989` |
| THEIRS (vence a origin) | `git merge-tree --write-tree --merge-base=7a15852791 -X theirs d723a90107 a9b4d6c6fb` | `bac609977ac483a15d00fabaf642ca39e8e8a3b4` |

Prefixos `d93bc10e` / `bac60997` do doc-irmão confirmados nos 40 hex.
Contagem re-derivada do `merge-plain` (sem `-X`): **578 arquivos** =
285 `content` (stages 1+2+3) + 283 `add/add` (stages 2+3) +
7 `modify/delete` apagado-na-origin/alterado-na-dia (stages 1+2) +
3 `modify/delete` apagado-na-dia/alterado-na-origin (stages 1+3).
Stage 2 = dia, stage 3 = origin (conferido pelos 10 paths contra o doc-irmão).

## 2. THEIRS materializada: tsc + suite (vs OURS do doc-irmão)

Materialização: `git archive bac609977ac... | tar -x -C .tmp/sync20-22/theirs`
+ `node_modules` da workspace (mesmos do typecheck do doc-irmão).

Typecheck (`npx tsc -b --force`, log em `.tmp/sync20-22/tsc-theirs.log`):

| Estado | Erros TS |
|---|---|
| dia (base) | 0 |
| origin/main (ponta) | 98 |
| OURS (dia vence) | 23 em 7 arquivos, todos sintaxe de auto-merge (TS1005/TS1109/TS1128) |
| **THEIRS (origin vence)** | **1: `src/components/multiplix/MultiplixView.tsx(642,7) TS1005** |

O único erro da THEIRS é o mesmo arquivo que o doc-irmão já flagrou como
"auto-merge limpo que quebra": `MultiplixView.tsx` não tem conflito declarado
e mesmo assim o merge automático enxertou o bloco da dia (+108 linhas) de forma
inválida. Conclusão reforçada: **typecheck verde não valida merge; a suite manda**.

Suite (`npx vitest run`, log em `.tmp/sync20-22/vitest-theirs.log`):

| Estado | Arquivos | Testes | Exit |
|---|---|---|---|
| dia (base) | 1499 passed, 5 skipped (1504) | 13235 passed, 24 expected-fail, 48 todo (13307) | 0 |
| OURS | 1271 passed, **545 failed**, 5 skipped (1821) | **1552 failed** / 12359 passed / 23 expected-fail / 4 skipped / 45 todo (13983) | 1 |
| **THEIRS** | **286 failed, 1530 passed, 5 skipped (1821 arquivos)** | **554 failed / 13743 passed / 21 expected-fail / 41 todo (14359 testes)** | **1 (vermelho esperado, controle)** |

Leitura OURS×THEIRS (tsc): a dia cura a origin via 57 arquivos limpos
(`src/integrations/supabase/types.ts` à frente: tipos gerados defasados na origin).
A THEIRS herda essa cura e fica com 1 erro contra 23 da OURS — mas tsc não conta
história de runtime: a direção "origin vence" descarta código da release da dia,
então a suite da THEIRS é controle, não candidata. **A direção do merge real
continua sendo OURS-como-base (código da dia) com fusão manual** — este doc só
diz, área por área, o que pode ser mecânico e o que exige gente.

Leitura OURS×THEIRS (suite): a THEIRS quebra MENOS que a OURS (554 vs 1552
testes falhando; 286 vs 545 arquivos) — esperado: o corpus de testes da origin
é mais acoplado ao próprio código que o da dia ao dela. Mas o perfil de falha
da THEIRS confirma o achado do doc-irmão numa forma nova: 11 arquivos com erro
de transform/parse no vitest (`clientMessageId` e `MENSAGENS` declarados 2x em
`outbound-message.service.ts` e `useReauthentication.ts`, fora os 9 demais —
lista no log), dos quais o tsc só acusou 1 (`tsc -b` para no projeto quebrado e
não desce aos dependentes). Ou seja: **auto-merge limpo gera duplicação de
identificador mesmo fora dos 578 conflitos**, e só a suite pega. O resto das
554 falhas é comportamental (TestingLibrary não acha texto/role da dia no código
da origin; mocks `vi.fn()` nunca chamados; `QueryClientProvider`/`AuthProvider`
ausentes) concentrado em inbox (127 arquivos), talkx (100), catalog (71) e
connections (50) — o checklist de reconciliação do lado origin-vence, espelho
do checklist OURS do doc-irmão.

## 3. Matriz executável dos 578 + 1 auto-limpo perigoso

- `docs/plans/sync/dados/matriz-578.csv` (579 linhas de dados: 578 conflitos +
  1 `.env.production`; colunas `area,tipo,path`; tipo ∈ `content`,
  `add/add`, `modify/delete|...`, `auto-limpo_EXIGE-decisao-manual`).
- `docs/plans/sync/dados/lotes.json` (19 lotes ≤40 arquivos, ver §5).
- `.tmp/sync20-22/merge-plain.raw.txt` (evidência bruta do merge-tree).

Por área (arquivo conta 1x): src/components 314 (149 content, 157 add/add, 8 m/d),
src/hooks 113 (64/47/2), supabase/functions 73 (38/35/0), src/outros 14 (13/1/0),
scripts 13 (6/7/0), src/lib 11 (1/10/0), docs 9 (3/6/0), raiz/outros 7 (1/6/0),
src/pages 7 (2/5/0), .github 6 (5/1/0), e2e 5 (1/4/0), supabase/outros 4 (2/2/0),
supabase/migrations 2 (0/2/0). Hotspots: `src/components/inbox` 81,
`src/components/talkx` 58 (57 content/add-add + 1 m/d), `src/components/settings` 17.

Os 10 `modify/delete` (decisão de produto, sem `-X` que resolva):
apagado-na-origin/alterado-na-dia (7 — a dia ainda usa; default MANTER):
`campaigns/CampaignABTesting.tsx`, `campaigns/CampaignCreateDialog.tsx`,
`campaigns/CampaignsView.tsx`, `settings/AIAutoTagsConfig.tsx`,
`components/ui/pagination.tsx`, `components/ui/sidebar/sidebar-primitives.tsx`,
`hooks/inbox/useInboxFilterTags.ts`;
apagado-na-dia/alterado-na-origin (3 — checar se a remoção da dia foi intencional):
`payments/PaymentLinksView.tsx`, `talkx/TalkXHelp.tsx`, `hooks/payments/usePaymentLinks.ts`.

Alerta de DBA (fora do padrão): `supabase/migrations/20261006180831_login_gate_rpc.sql`
e `.../20261006222024_team_receipts_reactions_conversation_id_forced.sql` são
`add/add` com o MESMO nome dos dois lados e conteúdo diferente — os dois lados
editaram arquivos de migration já numerados. Nunca escolher um lado no escuro:
comparar, ficar com um, e repor a diferença do outro em migration NOVA.
Nada de `--force` nem edição de migration aplicada.

Alerta de produto (insumo do coordenador via SYNC20-18, registrado na matriz
como `auto-limpo_EXIGE-decisao-manual` e no lote B05): `.env.production`
**não** está nos 578 — o merge automático o resolve sozinho, e é aí que mora o
perigo. Base e dia: `VITE_CRM_INTEGRATION_ENABLED=false`; origin: `true`
(1 única linha mudada; a dia não tocou o arquivo). O auto-merge entrega `true`
sem nenhum marcador de conflito, e voltar para `false` na resolução desligaria
a Fase 9 CRM em produção sem aviso — o próprio arquivo manda staged rollout
("change to true only after the canonical DB migration and crm-integration Edge
Function have passed authenticated production smoke tests"). **Decisão manual
de produto, nunca `-X` automático**: confirmar com o dono da Fase 9 se os smoke
tests passaram antes de aceitar `true`; `false` só com aceite explícito de
desligar a Fase 9.

## 4. Decisão: nem global-por-lado, nem 578 manuais — por área, com default

`-X ours`/`-X theirs` de verdade continuam proibidos (são experimento, não merge).
A resolução é por área, com lado-default para destravar hunk ambíguo:

| Área | Default | Porquê |
|---|---|---|
| `src/components`, `src/hooks` (produto: inbox, talkx, resto) | **dia como base, fusão manual hunk a hunk** | é código da release; a origin traz refactors paralelos (283 add/add = mesmos caminhos criados dos dois lados) |
| `supabase/functions` | **dia como base, fusão manual**; `_shared/validation.ts` e diffs só-de-tipo seguem a dia | tipos da dia curam a origin (§2) |
| `supabase/migrations` (2) | **manual com DBA**, regra do alerta acima | mesmo nome, conteúdo diferente |
| `.github/workflows` (5 content), `playwright.config.ts` | **origin como base, revisar hunks da dia** | CI é propriedade da main; trazer só os guards que a dia adicionou |
| `scripts`, `e2e`, `tests/contracts` | **dia como base; o que for só-da-origin entra inteiro** | maioria add/add de testes novos |
| `docs`, `ESTADO.md`, `FEATURE_REGISTRY.md`, `.tmp/*` | **mecânico** (lote M0): docs = concatena/append; `.tmp/*` = fica o da dia (evidência local, não produto) | sem runtime |
| 10 `modify/delete` | **manual de produto** (lista no §3) | sem default automático |

## 5. Lotes de execução (máx 40 arquivos; detalhe em `docs/plans/sync/dados/lotes.json`)

| Lote | Conteúdo | N |
|---|---|---|
| B00 M0-mecânico-global | `.tmp/*`, ESTADO, FEATURE_REGISTRY, 6 docs add/add, toolchain.json, 2 contracts | 13 |
| B01 db | 2 migrations (c/ DBA) + 4 supabase/outros | 6 |
| B02/B03 functions | `_shared` + functions em 2 lotes | 37 + 36 |
| B04/B05 misc | scripts, e2e, docs-rest, .github-rest, src/lib, src/outros, src/pages **+ `.env.production` (decisão manual, §3)** | 40 + 20 |
| B06–B08 hooks | 3 lotes por afinidade de módulo | 38 + 38 + 37 |
| B09–B13 comp-resto | 5 lotes | 5×35 |
| B14/B15 comp-talkx | 2 lotes | 29 + 29 |
| B16–B18 comp-inbox | 3 lotes | 3×27 |

Total 19 lotes, 579 itens (578 conflitos + `.env.production`), nenhum acima de 40. Ordem sugerida: B00 → B01 →
B02 → B04(lote misc encosta CI/scripts) → hooks → comp-resto → talkx → inbox
(do menor acoplamento ao hotspot; inbox por último porque é onde os 545 arquivos
falhando da suite OURS mais concentram). Portão de cada lote: `tsc -b --force`
sem erro NOVO no lote + testes do módulo verdes; portão final do merge:
patamar da dia (1499 arquivos / 13307 testes) + `db:guard` + `zapp-verify --rapido`.

## 6. Limites

- Resolução 100% por lado nos protótipos; o merge real é fusão manual — os erros
  dos protótipos são piso, não teto.
- Suite da THEIRS rodada até o fim (controle do experimento): 286 arquivos /
  554 testes falhando; log completo em `.tmp/sync20-22/vitest-theirs.log`.
- Proibido no cartão executor: push, merge nas branches fora da janela do
  integrador, deletar branch, aplicar migration, tocar produção.

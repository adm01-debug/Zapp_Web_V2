# Dossiê — claude/fix-lint-mediamigration-service-261101-1250 (PR #2463)

**Propósito**: resolver `no-restricted-imports` em `MediaMigrationTool.tsx` extraindo `countPendingMedia`/`fetchMigrationHistory`
para `src/services/mediaMigration.service.ts`, atualizar âncoras em `ESTADO.md`/`FEATURE_REGISTRY.md` e remocar o teste de progresso.
Commits úteis: `a025dab11`, `654e83fff`, `f5a1e9de0`, `ae4d6f712` (restante são merges de main). Merge-base `1252bb5a`, tip `8fa57120`.

**Veredito: INCORPORADA** (confiança média) — a mesma extração entrou na main pela PR #2816 (`cf79d70dd feat(admin): extrai lógica de banco
do MediaMigrationTool para serviço`, 2026-11-10).

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/services/mediaMigration.service.ts` | Idêntico à main | `hunk=PRESENT_BYTE`; `origin/main:src/services/mediaMigration.service.ts:20,33` exportam `countPendingMedia`/`fetchMigrationHistory` |
| `src/components/admin/MediaMigrationTool.tsx` | Incorporado | `origin/main:...MediaMigrationTool.tsx:9-10` importa do service; nenhuma referência a `supabase`/`CDN_TEMP_PREFIXES` no componente (grep vazio). As 3 linhas `removed_still_in_main` (`processed/migrated/failed`) são da interface `MigrationResult` (linhas 24-26), que a branch também mantém — falso positivo do line_check (as removidas eram da `MigrationHistoryEntry`, hoje no service) |
| `ESTADO.md` | Incorporado | `origin/main:ESTADO.md:98` já aponta `MediaMigrationTool.tsx:97`, e `invokeEdge('migrate-media-storage'` está na linha 97 da main |
| `FEATURE_REGISTRY.md` | Incorporado | `hunk=PRESENT_REVERSE_APPLIES` |
| `src/components/admin/__tests__/MediaMigrationTool.progresso.test.tsx` | Mesmo comportamento com outro texto | Branch troca o mock de `@/integrations/supabase/client` por mocks de `@/services/mediaMigration.service` + `@/lib/invokeEdge`. Na main o teste segue mocando o client (linhas 4-6); o service (`mediaMigration.service.ts:1`) e `invokeEdge` (`src/lib/invokeEdge.ts:33,250`) importam esse mesmo client, logo o mock continua interceptando. As asserções são idênticas (progressbar `Progresso da migração de mídia`, `Migrando mídias`, sem `aria-valuenow`, `data-state=indeterminate`). A versão da main é inclusive mais robusta (`findByRole('alertdialog')` + `within`), e passou no CI obrigatório do #2816 (teste não alterado ali). **NÃO VERIFICADO em execução local**: `node_modules` ausente no clone (`npx vitest` falha com EOVERRIDE) |

**Lacunas a recuperar**: nenhuma de valor. A única diferença (estratégia de mock do teste) não altera cobertura; valor `nenhum`.

**apagar_branch_seguro**: true.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk útil de `git diff 1252bb5a 8fa57120` ausente da `origin/main` (`dac285f62`). Não encontrei nenhum. **CONCORDO: INCORPORADA; apagar a branch é seguro.**

Comparação arquivo por arquivo (feita com `diff <(git show origin/main:X) <(git show origin/claude/...:X)`):

1. `src/services/mediaMigration.service.ts` — **byte-idêntico à main**. `origin/main:src/services/mediaMigration.service.ts:1` importa o client, `:20` `countPendingMedia`, `:33` `fetchMigrationHistory`, `CDN_TEMP_PREFIXES` na linha 3. Entrou por `cf79d70dd` (#2816, 2026-11-10).
2. `src/components/admin/MediaMigrationTool.tsx` — a única diferença é a **ordem do import**: a main põe o import do service em `:9-10` (antes do bloco `AlertDialog`), a branch o põe depois (`:19-20`). Mesmo conteúdo, zero efeito funcional; a ordem da main é a que passou no CI de #2816. O componente da main não tem nenhuma referência a `@/integrations/supabase/client` nem a `CDN_TEMP_PREFIXES` (grep vazio) — o objetivo da branch (`no-restricted-imports`) já está atendido na main.
3. `ESTADO.md` — a âncora que a branch corrige já está na main: `origin/main:ESTADO.md:98` = `` | `migrate-media-storage` | A | `src/components/admin/MediaMigrationTool.tsx:97` | ``, e `invokeEdge('migrate-media-storage', …)` está de fato em `origin/main:src/components/admin/MediaMigrationTool.tsx:97`. O resto do diff ESTADO.md da branch é conteúdo **gerado e defasado** (branch diz 85 edges / E=21, main diz 92 edges / E=27): regredir isso pioraria o arquivo.
4. `FEATURE_REGISTRY.md` — idem: `origin/main:FEATURE_REGISTRY.md:79` já traz `| media-migration | … | Full | src/lib/invokeEdge.ts |`, exatamente a mudança da branch. As outras diferenças são contagens antigas (Full 44 vs 45) e um `talkx-kit` desatualizado.
5. `src/components/admin/__tests__/MediaMigrationTool.progresso.test.tsx` — única lacuna real de linhas (12), e **não tem valor**. #2816 não tocou o teste, então a main segue mocando `@/integrations/supabase/client`. Verifiquei que esse mock continua suficiente: `origin/main:src/lib/invokeEdge.ts:250` usa **somente** `supabase.functions.invoke` (nada de `auth`/`from` no caminho), que o mock fornece como promise pendente → `running=true` → o `progressbar` de `MediaMigrationTool.tsx:198` renderiza; e a falha de `countPendingMedia` (o mock não tem `.from`) é absorvida pelos handlers de rejeição em `MediaMigrationTool.tsx:57-58,77-84`, sem desabilitar o botão (`:183` só depende de `running`). As asserções são as mesmas (nome acessível, sem `aria-valuenow`, `data-state=indeterminate`); a versão da main é mais estrita (`findByRole('alertdialog')` + `within`). A versão da branch é apenas outra estratégia de mock — e mais frágil, porque clica em "Iniciar migração" sem esperar o `alertdialog` abrir.

Não executei vitest (`node_modules` ausente): a afirmação sobre o teste da main é **NÃO VERIFICADO em execução**, sustentada por leitura do caminho de código acima e pelo CI obrigatório de #2816/#3138 na main.

Lacunas adicionais: nenhuma.

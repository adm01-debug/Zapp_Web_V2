# claude__kind-gates-87mwoe — PR #2185

- Ref: `origin/claude/kind-gates-87mwoe` · tip `88291f53a` · merge_base `61a973da6` (2026-10-22) · 90 commits, último 2026-10-31
- Triagem anterior (2026-11-08): OBSOLETA. **Confirmada em quase tudo, com 2 resíduos vivos.**

## Propósito
Branch de "loop de fix CI" do PR #2185: deixar os 6 required checks verdes. Três frentes:
1. **Correções de produto achadas pelo Qodo durante o loop** (KB, inbox, diagnostics, settings, war room, Talk X).
2. **Infra de teste** (`src/test/setup.ts`: mocks de `Element.prototype` / `clientHeight` / `clientWidth` para `@tanstack/react-virtual` 3.x no jsdom) e testes.
3. **Relatórios de sessão** (`PENDENCIAS.md`, `RELATORIO_CI.md`, âncoras do `ESTADO.md`) + 1 linha em `ci.yml`.

Tudo da frente 1 já está na `main`, em forma igual ou melhor. As frentes 2 e 3 foram superadas por reescritas deliberadas na `main`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/business/useWarRoomData.ts` | INCORPORADA | `origin/main:src/hooks/business/useWarRoomData.ts:78` `export const WARROOM_MAX_ROWS = 200;` + guardas em `:108` e `:154` (mesmas mensagens de erro) |
| `src/hooks/integrations/useKnowledgeBase.ts` | INCORPORADA (melhor) | `origin/main:...useKnowledgeBase.ts:61` estado `error`; `:66..:78` `try/catch` com `setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)` e comentário `t_1944d290` |
| `src/components/knowledge/KnowledgeBaseView.tsx` | INCORPORADA (forma diferente) | `origin/main:...KnowledgeBaseView.tsx:33` consome `error`; banner `data-testid="kb-error"` em `:120..:130` com `AlertCircle` + "Tentar novamente"; render em `:143` `{error ? (`. Main usa banner inline em vez de tela cheia |
| `src/hooks/integrations/useTalkXSegments.ts` | INCORPORADA (melhor) | `origin/main:...useTalkXSegments.ts:80-81` flag `ponteOnly` em `real_sector`/`real_uf`; `:90` `lead_origin` `comingSoon: true`; `:207` guarda em `ruleToFilter`; `:281` `assertNoPonteOnlyFields`; `:312` e `:334` `supabase.rpc.bind(supabase)`. Main generalizou o que a branch tinha hardcoded por nome de campo |
| `src/hooks/integrations/useTalkXSuppression.ts` | INCORPORADA (remoção feita na main) | A branch apagava o hook morto `useTalkXSuppression()`. Na main ele não existe mais: `git grep "export function useTalkXSuppression" origin/main` → só `useTalkXSuppressionActivity:218` e `useTalkXSuppressionStats:283`; há teste de regressão `origin/main:src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` (TL-002). As 6 linhas "removed_still_in_main" são genéricas (`if (error) throw error;`, `return {`) dos outros hooks do arquivo |
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | INCORPORADA | arquivo ausente na main (`git ls-tree origin/main` vazio) — mesma deleção |
| `src/hooks/inbox/useInboxFilters.ts` | OBSOLETA (superada) | Main já tem a versão com React Router: `:97` `useSearchParams()`, `:106-110` `basePrefs` lê `searchParams.get('type')`, `:151-160` `handleContactTypeChange` usa `setSearchParams(..., { replace: true })`, e **além disso** `:166..` um `useEffect` com `lastUrlType` que sincroniza o draft em back/forward — cobre o R2-INB-031 da branch por outro caminho |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | INCORPORADA | `hunk: PRESENT_REVERSE_APPLIES` (prova mecânica) |
| `src/hooks/inbox/useInboxBulkActions.ts` | OBSOLETA (superada) | Branch: `VALID_FROM_ARCHIVED = {open,pending}`, resto cai em `'open'`. Main `:242..:300`: FSM real — `validFromArchived = {open,resolved}`, grupo de dois passos (`archived→open→original`), `resolved` via RPC em modo `restore` (evita 23505), `pending`/`closed` tratados como legado → `open`, cada UPDATE filtrando o status esperado. Abordagem da branch é um subconjunto incorreto |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | OBSOLETA | os testes da branch asseguram o mapeamento antigo. Main tem suíte muito maior do `undoAction` (`:654`, `:679`, `:713`, `:737`, `:769` — inclui "decisão do dono (2026-11-13): conversa aguardando é pulada no lote") |
| `src/hooks/tasks/__tests__/workItemFormat.test.ts` | INCORPORADA | `origin/main:...workItemFormat.test.ts:122-126` já envolve o caso em `withTimeZone('America/Sao_Paulo', ...)` |
| `src/test/setup.ts` | OBSOLETA (abordagem rejeitada) | Main manteve `HTMLElement.prototype` (`:139`) e **acrescentou `writable: true`** para permitir `elemento.getBoundingClientRect = ...`; não há mock global de `clientHeight`/`clientWidth`. A main resolveu o mesmo problema do react-virtual 3.x por teste, ex.: `origin/main:src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx:60` `Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 600, configurable: true })`. Aplicar o global da branch mexeria em ~18 arquivos de teste que já fazem seu próprio mock |
| `.github/workflows/ci.yml` | OBSOLETA | Branch reaplica `if: ${{ !cancelled() }}` no job `build`. Main reescreveu o ci.yml em `5721e4f50` (2026-10-16, "CI mínimo") removendo toda a arquitetura `reuso`/`!cancelled()` e o gate do build hoje é `if: github.event.pull_request.draft != true` (`origin/main:.github/workflows/ci.yml:230`, de `578e5671c` — W45 draft). O motivo da branch (build `skipped` escondia o estouro de bundle de 359,5 KB) deixou de existir: a main subiu o teto para **325 KB** (`origin/main:performance-budget.json`, SL-103D de 2026-10-26) |
| `ESTADO.md` | OBSOLETA | Âncoras da branch (`useKnowledgeBase.ts:139`/`:210`, `useInboxBulkActions.ts:249`) estão vencidas: a main, regenerada, tem `:137`/`:208` (`origin/main:ESTADO.md:43`) e `:323` (`:58`) |
| `PENDENCIAS.md` | OBSOLETA | Arquivo da branch é o relatório do PR #2185 (2026-10-31). A main tem outro documento, de outra sessão: `# PENDÊNCIAS CI — 2026-11-12` |
| `RELATORIO_CI.md` | OBSOLETA | Idem: main tem `# RELATÓRIO CI — fix-ci-workflows-hxupgs / fix-ci-workflows-261112-0400` (2026-11-12) |
| `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | INCORPORADA | `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` |

## Resíduos vivos (não estão na main, ainda aplicam) — valor baixo

### 1. `src/hooks/system/useDiagnosticsData.ts` — latência exibida mesmo com o banco "down" por falha na contagem de conexões
Main (`:275`, `:317`) só anula a latência quando a sonda de `contacts` falha: `const dbLatency = dbError ? null : ...` e `classifyHealth(connectionsCountError ?? dbError, dbLatency, 500, 2000)`. Com `connectionsCountError`, o painel mostra `database: 'down'` **e** "Latência: Xms" medido na sonda que deu certo (`origin/main:src/components/diagnostics/DiagnosticsView.tsx:84` e `:139`). Testes da main (`useDiagnosticsData.test.ts:483`, `:492`) cobrem só o caso de `contacts`.

Hunk a portar (Qodo Finding 4):
```ts
// Latência só é exibida quando nenhum erro de banco ocorreu. Se a query de
// contatos sucedeu mas a de connections falhou, a latência medida NÃO representa
// o estado do banco (que ficou 'down' por connectionsCountError).
const dbLatencyFinal = (dbError ?? connectionsCountError) ? null : dbLatency;
setHealth({
  database: classifyHealth(dbError ?? connectionsCountError, dbLatencyFinal, 500, 2000),
  ...
  dbLatency: dbLatencyFinal,
```
(o resto do hunk da branch — `try/catch` em volta das contagens e `?? 0` em vez de `|| 0` — é equivalente ao que a main já faz; não portar.)

### 2. `src/hooks/system/useUserSettings.ts` — sem aviso ao usuário quando o fetch LANÇA
Main tem `isError` (`:88`) e toast no caminho de `error` do PostgREST (`:124`), mas no `catch` (rede/transporte) faz só `if (ativo) setIsError(true);` (`origin/main:...useUserSettings.ts:166`) — a tela fica com os padrões, sem avisar.

Hunk a portar (no `catch (err)` de `fetchSettings`):
```ts
if (ativo) {
  setIsError(true);
  toast({
    title: 'Não foi possível carregar as configurações',
    description: 'Os valores exibidos são os padrões. Recarregue a página para tentar de novo.',
    variant: 'destructive',
  });
}
```
Atenção: a main usa o texto curto `'Erro' / 'Não foi possível carregar as configurações.'` no outro caminho; padronize um dos dois para não ter duas redações.

## Veredito
**PERDIDA_PARCIAL** — 14 dos 16 arquivos com lacuna estão incorporados na main ou foram superados por decisão deliberada dela (reescrita do `ci.yml`, FSM do desfazer de arquivamento, mock de virtualizador por teste, docs de outra sessão). Sobram dois ajustes pequenos de UX/diagnóstico, ambos de valor baixo e integralmente transcritos acima.

`apagar_branch_seguro = false` apenas enquanto os dois resíduos não forem portados ou recusados; com eles neste dossiê, nada mais da branch precisa ser lido.

## Verificação adversarial

Papel: refutar a triagem (`PERDIDA_PARCIAL`). Resultado: **concordo** — as duas lacunas existem na `main` de hoje
(`origin/main` = `dac285f62`), são pequenas, e nenhum outro hunk de valor ≥ médio ficou fora.

### Lacuna 1 confirmada — latência exibida com banco "down"
- `origin/main:src/hooks/system/useDiagnosticsData.ts:317` → `database: classifyHealth(connectionsCountError ?? dbError, dbLatency, 500, 2000)`
  e `:321` → `dbLatency,` (a latência medida na sonda de `contacts` em `:275` vai para o estado mesmo quando o
  erro que derrubou o status veio de `connectionsCountError`).
- Efeito no painel: `origin/main:src/components/diagnostics/DiagnosticsView.tsx:76` (`failureDetail`) devolve
  `"Latência crítica: {latency}ms"` quando `status === 'down'` e `latency !== null` — usado em `:84`; o cartão de
  `:139` mostra `{dbLatency}ms` em vez de `—`. Ou seja: declara o banco fora do ar e ainda mostra um número de
  latência que não mede o banco. Correção da branch: `const dbLatencyFinal = (dbError ?? connectionsCountError) ? null : dbLatency;`
- `git log -S'dbLatencyFinal' origin/main -- src/hooks/system/useDiagnosticsData.ts` → vazio: nunca entrou na `main`,
  não foi revertido de propósito.
- Encaixa no código atual: `dbError`, `connectionsCountError` e `classifyHealth` existem nas mesmas posições; na
  `main` `connectionsCountError` não é lançado (comentário em `:294-295`), então o port é de 2 linhas.
- Nota de precisão: o texto exibido é `"Latência crítica: Xms"`, não `"Latência: Xms"` como escreveu a triagem —
  a substância (número enganoso ao lado de "fora do ar") é a mesma.

### Lacuna 2 confirmada — configurações falham em silêncio
- `origin/main:src/hooks/system/useUserSettings.ts:164-166` → `catch (err) { log.error(...); if (ativo) setIsError(true); }`
  sem toast. O caminho PostgREST (`:122-127`) já avisa (`'Não foi possível carregar as configurações.'`), com
  `toast` importado em `:6`.
- `isError` não é consumido por nenhuma tela: `SettingsView.tsx:74` desestrutura só `settings, isLoading, isSaving,
  updateSettings, saveAppearanceSettings`. Logo, em falha de rede/transporte o usuário vê os padrões sem qualquer sinal.
- Port encaixa (toast já importado, mesmo bloco `if (ativo)`).

### Tentativas de refutação que falharam (main cobre, igual ou melhor)
- `useInboxFilters.ts` — a precedência da URL sobre o draft (R2-INB-031) **está** na `main`, em forma superior:
  `useSearchParams` em `:96`, `basePrefs` lendo `?type=` em `:105-108`, e efeito de sincronismo do draft com
  back/forward em `:162-180` (a branch só lia a URL na derivação, sem sincronizar o draft). `handleContactTypeChange`
  em `:147-159` usa `setSearchParams` com updater funcional.
- `useInboxBulkActions.ts` — `VALID_FROM_ARCHIVED` da branch (`{open,pending}`, resto → `open`) foi substituído por
  FSM real em `origin/main:...:263-300`: `validFromArchived = {open, resolved}`, grupo de dois passos
  `archived→open→original`, `resolved` via RPC em modo `restore` (evita 23505), legados `pending/closed` → `open`.
  A branch é estritamente pior aqui.
- `useWarRoomData.ts` — `WARROOM_MAX_ROWS = 200` em `origin/main:78`, guardas em `:108` e `:154`. Incorporada.
- `useKnowledgeBase.ts` / `KnowledgeBaseView.tsx` — estado `error` em `:61`, `setError` em `:73`/`:75`; banner
  `data-testid="kb-error"` em `KnowledgeBaseView.tsx:120`. Incorporada.
- `useTalkXSuppression.ts` — o hook morto que a branch apagava já não existe: `origin/main` exporta apenas
  `SUPPRESSION_ACTIVITY_EVENT_TYPES:32`, `suppressionActivityAction:71`, `suppressionActivityTitle:83`,
  `useTalkXSuppressionActivity:218`, `useTalkXSuppressionStats:283`. Objetivo cumprido.
- `.github/workflows/ci.yml` — o `if: ${{ !cancelled() }}` servia para revelar o `🏗️ Build` mascarado por
  `if: success()`. A `main` reescreveu o arquivo: o job `build` está em `:225` com `if: github.event.pull_request.draft != true`,
  sem máscara. Perímetro de CI, superado por decisão deliberada.
- `src/test/setup.ts` — o mock global de `Element.prototype.clientHeight/clientWidth` não está na `main` (só
  `HTMLElement.prototype.getBoundingClientRect` em `:139`), mas 18 arquivos de teste da `main` tratam `clientHeight`
  localmente (`git grep -l clientHeight origin/main -- src/`). Instalar o getter global agora mudaria o
  comportamento de testes verdes. Não é lacuna — é divergência de abordagem resolvida na `main`.
- `PENDENCIAS.md` / `RELATORIO_CI.md` / `ESTADO.md` — relatórios de sessão do PR #2185 (SHAs e runs de 2026-10-31).
  Histórico, sem valor operacional hoje.

### Veredito
`PERDIDA_PARCIAL` mantido. Valor total em jogo: 2 ajustes de clareza (≈3 linhas), ambos de valor **baixo**, nenhum
em fluxo crítico (WhatsApp, envio, inbox, login intactos). Não apagar a branch antes de portar as 2 linhas — ela é
o único registro delas; depois do port, apagar é seguro.

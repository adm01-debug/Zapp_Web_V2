# Dossiê — claude_05__serene-feynman-3uuurw (PR #2498)

- Ref: `origin/claude_05/serene-feynman-3uuurw` · tip `cc286ee0b` · merge-base `dfef2487a` (2026-11-02) · 33 commits à frente.
- Triagem anterior (2026-11-08): `JA_NA_MAIN`. Confirmada **parcialmente** — ver lacuna no `SearchInsightsView.tsx`.

## Propósito
Dois eixos num só ramo:
1. **ZW-0011** — tela admin "Insights de Busca" chamava RPC inexistente `get_search_insights` (jsonb); corrigir para a RPC canônica `search_insights(p_days)` (RETURNS TABLE, migration `20261016013134`), ajustar parse, textos e testes para "termos não são armazenados".
2. **Auditoria Supabase** — atualização dos entregáveis `auditoria-supabase/{RELATORIO,achados.json,progresso.json}` e `scripts/db-audit/grants-baseline.json` (sessão 2026-11-01).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/admin/useSearchInsights.ts` | **INCORPORADA** (outro texto, mesmo comportamento) | main `c6c7697af` (#2798, 2026-11-08): `origin/main:src/hooks/admin/useSearchInsights.ts:71` `supabase.rpc('search_insights', { p_days: days })`; `:72` `parseSearchInsights(data?.[0], days)`; `:47-61` lê `total_searches/searches_with_click/searches_without_results`, `clickRate = clicks/total`, `topQueries: []`, `noResultTerms: []`. Branch extraía `raw[0]` dentro do parse; main extrai no caller — equivalente. |
| `src/components/admin/__tests__/SearchInsightsView.test.tsx` | **INCORPORADA** (equivalente) | main (#2798) `:24-28` PAYLOAD `{total_searches:1234, searches_without_results:308, searches_with_click:518}` passado como `[PAYLOAD]`; `:57` `toHaveBeenCalledWith('search_insights', {p_days:30})`; casos vazio/100%/erro iguais. Diferença só nas strings de empty-state (main mantém `Nenhum termo…` porque a view não mudou). `#2798` ainda adicionou `useSearchInsights.test.ts` (39 linhas) que a branch não tinha. |
| `src/components/admin/SearchInsightsView.tsx` | **PERDIDA** (11 linhas, só texto/JSDoc) | `MAIN_UNCHANGED_SINCE_BASE`, hunk `ABSENT_APPLIES_CLEAN`. main `:4` ainda cita RPC `get_search_insights` (única referência restante no repo: `git grep get_search_insights origin/main -- src/ supabase/` → só esta linha); `:12-13` "termos vêm normalizados pela RPC (`term_normalized`)"; `:120` subtítulo "O que as pessoas procuram… apenas termos normalizados"; `:210-211` "Use a lista abaixo…"; `:221`/`:228` empty-states "Nenhum termo registrado/sem resultado no período." — mas o hook da main devolve listas **sempre vazias** (`useSearchInsights.ts:58-60`). Tela promete listas que nunca existirão. |
| `auditoria-supabase/achados.json` | **OBSOLETA** (superada) | main `f120344f9` (#2844): `_meta.total_zw: 48`, `ALTO: 3, MEDIO: 16, BAIXO: 4, RESOLVIDO: 12` (`:35-42`), com reverificações 2026-11-08 (`:16-20`). As 22 linhas "faltantes" da branch são valores antigos (total 47, ALTO 4, MEDIO 17, BAIXO 3, RESOLVIDO 11) que a main revisou depois. |
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` | **OBSOLETA** (superada) | main `:25` `**ALTO** \| 3 \| ZW-0004, ZW-0007, ZW-0009`, `:27` `**BAIXO** \| 4 \| ZW-0002 (reclassificado 08/11)…`; `:50-51` mantém as linhas ZW-0002/ZW-0004 da branch acrescidas de "(ver reclassificação 08/11 abaixo)". As 4 linhas faltantes são a tabela antiga (ALTO 4 / BAIXO 3). |
| `auditoria-supabase/progresso.json` | **INCORPORADA** (mesmo fato, outra chave) | única linha faltante `rls_matrix_status: "NÃO VERIFICADO — … Docker daemon não disponível"`; main `:294` `secao11_rls_evidencia.rls_matrix_esta_sessao: "NÃO VERIFICADO — Docker daemon ausente; replay-local.sh não executado…"` e `:65` `A.11_rls_matrix: PARCIAL…`. |
| `scripts/db-audit/grants-baseline.json` | **OBSOLETA** (superada) | main `:5` `generated_at: 2026-11-15`, `:9` `service_role_execute_count: 411`, `:10` `authenticated_execute_count: 226` (`2cf0153ae` #3135). Branch trazia 2026-11-01 / 394 / 223. Reordenação de chaves é cosmética. |

## Veredito: **PERDIDA_PARCIAL** (confiança alta)
Tudo que era comportamento (hook, teste) entrou via #2798; auditoria e grants foram superados por versões mais novas na main. Resta só a **cópia/JSDoc da view**, que hoje contradiz o hook (promete termos, mostra sempre vazio, cita RPC que não existe).

`apagar_branch_seguro = false` (há lacuna, ainda que pequena). Após portar o hunk abaixo, pode apagar.

## Lacuna a recuperar (valor: médio — UX enganosa em tela admin; sem mudança de comportamento)

Arquivo: `src/components/admin/SearchInsightsView.tsx` (aplica limpo em `origin/main`). Ao portar, atualizar também `src/components/admin/__tests__/SearchInsightsView.test.tsx:51-52` e `:97` (asserções `Nenhum termo registrado no período.` / `Nenhum termo sem resultado no período.` → `Textos de busca não são armazenados — privacidade por design.`; no 1º teste usar `getAllByText(...).toHaveLength(2)`).

```diff
@@ -1,16 +1,16 @@
 /**
  * SearchInsightsView — HZ1-06
  *
- * Tela de admin com os KPIs da busca global (RPC `get_search_insights`):
- * total de buscas, taxa de clique, buscas sem resultado, top 10 consultas e
- * top 10 termos sem resultado. Leitura apenas — esta tela NÃO exporta, não
- * imprime, não copia e não baixa nada (a informação não sai do sistema).
+ * Tela de admin com os KPIs da busca global (RPC `search_insights`):
+ * total de buscas, taxa de clique e buscas sem resultado. Leitura apenas —
+ * esta tela NÃO exporta, não imprime, não copia e não baixa nada (a
+ * informação não sai do sistema).
  *
  * Acesso: a própria RPC nega quem não é admin/supervisor (42501); a rota é
  * gated pelo item de menu em NavigationService (STAFF_ROLES).
  *
- * Sem PII: os termos vêm normalizados pela RPC (`term_normalized`), nunca de
- * contato, telefone ou conversa.
+ * Sem PII: a RPC expõe apenas contadores agregados — o texto de cada busca
+ * nunca é armazenado em `search_events` (privacidade por design).
  */
@@ -117,7 +117,7 @@ export function SearchInsightsView() {
           <p className="mt-1 text-sm text-muted-foreground">
-            O que as pessoas procuram, o que não encontram e o que clicam — apenas termos normalizados, sem dados pessoais.
+            Contadores agregados da busca global — o texto de cada busca não é armazenado por privacidade.
           </p>
@@ -207,8 +207,8 @@ export function SearchInsightsView() {
             <span>
-              Termos sem resultado são lacunas de conteúdo: a busca aconteceu e nada apareceu — nenhum clique
-              podia acontecer. Use a lista abaixo para decidir o que cadastrar ou documentar.
+              Buscas sem resultado são lacunas de conteúdo: a busca aconteceu mas nada apareceu.
+              O texto de cada busca não é armazenado — apenas os contadores acima estão disponíveis.
             </span>
@@ -218,14 +218,14 @@ export function SearchInsightsView() {
               emptyMessage={
                 data.total === 0
                   ? 'Nenhuma busca registrada no período.'
-                  : 'Nenhum termo registrado no período.'
+                  : 'Textos de busca não são armazenados — privacidade por design.'
               }
...
             <TermTable
               title="Sem resultado"
-              emptyMessage="Nenhum termo sem resultado no período."
+              emptyMessage="Textos de busca não são armazenados — privacidade por design."
```

Opção alternativa (mais limpa, fora do escopo da branch): remover as duas `TermTable` e o `sr-only` que conta termos, já que o hook nunca as popula (`useSearchInsights.ts:58-60`).

## Não recuperar
- `auditoria-supabase/*` e `grants-baseline.json`: a main tem versões posteriores (08/11 e 15/11); reaplicar a branch regrediria contagens.

## Verificação adversarial

Parecer: **CONCORDO** com PERDIDA_PARCIAL (confiança alta). `apagar_branch_seguro = false`. Main verificada em `dac285f62` (2026-11-15).

Tentei refutar por três vias; todas confirmaram a triagem:

1. **A lacuna existe e não foi removida de propósito.** `git show origin/main:src/components/admin/SearchInsightsView.tsx` linha 4 ainda diz "(RPC `get_search_insights`)" — e `git grep get_search_insights origin/main -- src supabase scripts` só acha essa linha em código (demais hits são `docs/_arquivo/`). Linhas 12-13 ("termos vêm normalizados pela RPC (`term_normalized`)"), 120 ("apenas termos normalizados"), 210-211 ("Use a lista abaixo…"), 221 e 228 (`Nenhum termo registrado/sem resultado no período.`) seguem intactas, com as duas `<TermTable>` renderizando `data.topQueries`/`data.noResultTerms`, que o hook da main fixa em `[]` (`origin/main:src/hooks/admin/useSearchInsights.ts:58-60`). `git log -S'Textos de busca não são armazenados' origin/main` e `-S'Contadores agregados da busca global'` → **zero commits**: o texto nunca entrou na main, não houve revert/remoção deliberada. `git log origin/main -- src/components/admin/SearchInsightsView.tsx` → último toque `025d0258d` (lote 880, pré-base); #2798 (`c6c7697af`) mexeu só em hook e teste.

2. **O fix da branch é a direção correta, não o texto da main.** Produção (`SUPABASE - ZAPP WEB V2 - MCP`, `db_query` SELECT em `pg_proc`): `search_insights(p_days integer)` → `TABLE(total_searches bigint, searches_without_results bigint, searches_with_click bigint, average_term_length numeric, searches_by_kind jsonb)`; **`get_search_insights` não existe**. A RPC não tem nenhuma coluna de termo — a tela da main promete listas que o banco não pode entregar. Logo a cópia/JSDoc da branch descreve a realidade; a da main, não.

3. **Ainda encaixa na main.** `git diff dfef2487a origin/claude_05/serene-feynman-3uuurw -- src/components/admin/SearchInsightsView.tsx | git apply --check --3way` → "Applied patch to 'src/components/admin/SearchInsightsView.tsx' cleanly."

Checagens contra os "não recuperar" (confirmam OBSOLETA/INCORPORADA, nada a resgatar):
- `origin/main:auditoria-supabase/achados.json:35-42` → `total_zw 48`, ALTO 3 / MEDIO 16 / BAIXO 4 / RESOLVIDO 12 (branch: 47/4/17/3/11 — anteriores).
- `origin/main:scripts/db-audit/grants-baseline.json` → `generated_at 2026-11-15`, `service_role_execute_count 411`, `authenticated_execute_count 226` (branch: 2026-11-01/394/223). `anon_execute` está vazio em ambos (o `still_sample` do JSON era só a abertura do array).
- `origin/main:auditoria-supabase/progresso.json:294` → `rls_matrix_esta_sessao: "NÃO VERIFICADO — Docker daemon ausente…"`; mesmo fato da linha única faltante, outra chave.

Correção menor no plano de porte: as asserções a trocar no teste da main estão em `src/components/admin/__tests__/SearchInsightsView.test.tsx` **linhas 54, 55 e 93** (não 51-52/97); linha 91 (`Nenhuma busca registrada no período.`) permanece como está.

Nenhuma lacuna adicional encontrada: o resto do diff do hook/teste é equivalente ao que #2798 já trouxe (main ainda adicionou `useSearchInsights.test.ts`, que a branch não tinha).

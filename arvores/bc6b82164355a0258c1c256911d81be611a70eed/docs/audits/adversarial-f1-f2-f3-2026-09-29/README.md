# Auditoria adversarial das Fases 1–3 (2026-09-29)

Auditoria independente, pós-merge, das três PRs do plano de finalização entregues em 29/09/2026:

| Fase | PR | Merge | Escopo |
|---|---|---|---|
| F1 | #1173 | `a4d85736` | C1 — edição de contato apagava endereço/coordenada (RPC `search_contacts` + guarda de edição + trigger de auditoria) |
| F2 | #1182 | `2b8c7994` | C2/C3/C4 — cascata `/suggest`→`/forward`, retry real, telemetria da dupla falha |
| F3 | #1195 | `694bf084` | C6/C7/C8 — estado explícito da busca, causa real do erro, pausa, lista única |

**Método:** 5 frentes especializadas em paralelo (DBA/Postgres · mutação · tempo/corrida · consumidores · paridade CI/produção/ledger) com **falsificação dirigida** — o objetivo de cada frente era derrubar as afirmações do autor, não confirmá-las. Cada achado traz comando e saída literal; cada frente declara o que **não** conseguiu verificar.

## Placar das afirmações do autor

| Afirmação | Veredicto | Medição |
|---|---|---|
| suíte = 4153 passed | **FALSO** | 4244 passed / 0 failed / 40 todo |
| eslint = 0 | PARCIAL | 0 erros, 1 warning pré-existente (`no-restricted-imports`, idêntico no pai `ac5d6299`) |
| migrations no ledger com o SQL real | **CONFIRMADO** | `file_sql_sha256 == ledger_sql_sha256` nas duas |
| ACL de `search_contacts` restaurada | **CONFIRMADO** | `proacl` sem grantee vazio; `has_function_privilege('anon',…)=false` |
| filtro de visibilidade exatamente como antes | PARCIAL | bloco `WHERE` do F1 idêntico ao pré-F1; a produção já mudou por migrations de terceiros (`can_edit_contact`) |
| sem quebrar leitor por posição | PARCIAL | `total_count` andou do ordinal 17 → 23; consumidor real lê por nome |
| fix em produção | **CONFIRMADO** | `zapp-web-v2.vercel.app`, build `0ab84095` (descende dos 3 merges); marcadores das 3 fases no bundle servido |
| nada pendente de DDL | CONFIRMADO (um sentido) | repo→ledger: 0; ledger→repo: 44 DDLs alheias fora do Git (drift pré-existente) |
| as 3 PRs com checks verdes | **CONFIRMADO** | 0 check vermelho nas 3 PRs; em `main`, DB Live Guard e E2E vermelhos por motivo pré-existente |
| flag desligada = comportamento antigo | **FALSO** | `ContactForm` ignora a flag e responde por 6 de 8 sessões |

## Achados por severidade

- **CRÍTICO — o repositório não reconstrói o banco.** `supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql:111` reemite `search_contacts` **sem** as 6 colunas de endereço, enquanto o SQL aplicado (ledger) tem as 23. `CREATE OR REPLACE` não muda row type ⇒ replay em ordem aborta com `42P13` e um ambiente novo fica **sem endereço no retorno da RPC** (C1 de volta). Divergência pinada em `migration-evidence.json` (`ledger-divergence/pinned-replay`, `safer-replay`), o que silencia o guard de drift. Confirmado por duas frentes independentes e por inspeção direta (arquivo × ledger × pin).
- **MÉDIO-ALTO / MÉDIOS no hook e na UI:** seleção superada devolve `null` e o consumidor mostra **toast destrutivo falso** + `/retrieve` e sessões extras (clique duplo/Enter segurado); troca de aba e janela do debounce sem abort; `/retrieve` em voo sobrevive a `clear()` e aplica seleção cancelada; pausa de 429 expira mas **nada religa** e a tela fica em "pausadas por 0 s" para sempre.
- **BAIXO:** função de trigger do F1 nasceu com EXECUTE para `PUBLIC`/`anon` (convenção da casa pede revogação); `cleared` só detecta apagamento total; plano do `search_contacts` sem uso de índice (pré-existente).
- **Força dos testes:** 112 mutações executadas, **42 sobreviveram** (37,5%); 41 foram mortas por 43 testes novos escritos e provados (vermelho com a mutação → verde sem). 14 categorias de teste fraco documentadas.
- **Incompletude do fix:** flag ignorada no `ContactForm`, terceira cópia da lista no ramo da flag desligada, 2º editor abrindo com endereço vazio, `types.ts` não regenerado, `ContactForm` sem `onBlur`/Tab.

## Falsos positivos testados e descartados

Nenhum dos 18 writers de `contacts` zera endereço; nenhum consumidor da RPC lê por posição; `HighlightedText` do chat intacto (`emphasize` default `false`); a guarda E04/E05 não produz perda (origem é a própria linha do banco; `setEditingContact` não é exportado).

## Relatórios

1. [`01-dba-postgres.md`](01-dba-postgres.md) — RPC, ACL, trigger, ledger, replay, performance
2. [`02-mutacao-forca-dos-testes.md`](02-mutacao-forca-dos-testes.md) — 112 mutações, sobreviventes, testes vácuos
3. [`03-tempo-corrida-flakiness.md`](03-tempo-corrida-flakiness.md) — 20 execuções, 3 fusos, debounce, corridas
4. [`04-consumidores-incompletude.md`](04-consumidores-incompletude.md) — writers, consumidores, flag, destaque
5. [`05-ci-producao-ledger.md`](05-ci-producao-ledger.md) — gates, ledger com hash, produção, checks

## Correções propostas (ainda NÃO aplicadas)

1. CRÍTICO do replay: `20260929370000` com as 23 colunas no `RETURNS TABLE` + pin ajustado + teste de replay em CI.
2. Corridas e estado mentiroso (`select()` tipado, invalidar seleção em `clear()`, abort na troca de aba e no `setQuery`, opção desabilitada durante o `/retrieve`).
3. Pausa de 429 com timer de recuperação e texto de pausa vencida distinto + `REVOKE EXECUTE … FROM PUBLIC, anon` na função de trigger.
4. Testes (43 novos), contagem de custo, `types.ts`, e decisão de escopo sobre o `ContactForm`.

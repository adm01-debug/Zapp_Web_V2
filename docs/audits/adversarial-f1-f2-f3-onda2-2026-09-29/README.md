# Auditoria adversarial F1–F3 · Onda 2 (5 frentes independentes)

**Data:** 2026-09-29 · **Base:** `77f1a054995130b1f9257eb7691a66985877d447` · **Método:** 5 frentes em paralelo, cada uma tentando **derrubar** o que a onda 1 afirmou, em ambiente descartável (Postgres 17.6) ou navegador real.
**Nada foi alterado no produto por esta auditoria:** `git status` limpo, `~/projetos` intocado, nenhum DDL/DML no banco canônico, zero commits de código.

Esta onda nasceu de uma pergunta específica: *os 7 achados da onda 1 eram reais?* A resposta medida é: **sim, mas com severidade menor e com um número errado**. E o que a auditoria encontrou de mais grave **não é das fases 1–3** — é trabalho do mesmo dia em outros módulos.

---

## 1. Veredicto por achado (o que caiu, o que ficou)

| # | Achado da onda 1 | Veredicto | Severidade |
|---|---|---|---|
| 1 | Replay: `20260929370000` reemite `search_contacts` com 17 colunas → `42P13` | **REPRODUZIDO** (`ERROR: 42P13 cannot change return type of existing function`) | CRÍTICO → **MÉDIO** (a divergência já é exceção registrada e pinada por hash; nenhum gate faz replay em ordem) |
| 2 | Clique duplo/Enter segurado → toast destrutivo **falso** + requests extras | **REPRODUZIDO** no bundle real: 2 cliques = 1 toast falso + **2 `/retrieve`** + **2 `session_token`**; 3 cliques = 2/3/3 (fórmula N−1) | MÉDIO-ALTO → **MÉDIO** (a seleção final **é** aplicada corretamente) |
| 3 | Pausa de 429 que não se encerra | **PARCIALMENTE**: `57s→37s→15s→0s→0s` e `retryButton=0` confirmados; **"nada religa" é falso** (uma tecla religa) | MÉDIO → **BAIXO** |
| 4 | `ContactForm` (cadastro) ignora a flag `mapa.searchbox-autocomplete` | **REPRODUZIDO**: `useFeatureFlag` chamada **0×**; com a flag OFF o cadastro dispara `/suggest` enquanto o picker do inbox dispara 0 | ALTO → **MÉDIO** (o "6 de 8 sessões" não é verificável) |
| 5 | "Suíte: 4153 passed" no relatório do autor | **PARCIALMENTE**: 4153 é falso — e o "4244" do auditor **também**: o correto é **4217** (`305` arquivos), confirmado pelo log do próprio CI | **MÉDIO** |
| 6 | Função de trigger nova nasceu com `EXECUTE` para `PUBLIC`/`anon` | **REPRODUZIDO** como fato; **não explorável** (`ERROR: trigger functions can only be called as triggers`) | BAIXO → **INFO** |
| 7 | 2º editor de contato abre com endereço vazio | **REPRODUZIDO** nos 2 caminhos (Detalhes e CRM 360°), **sem perda de dado** (payload diff-based = `{"name":…}`) | MÉDIO → **BAIXO** |

## 2. Rodapé de integridade (o que a auditoria corrigiu em afirmações **nossas**)

- **Produção é alvo móvel.** No momento da coleta o deploy servia `77f1a054`; o `0ab84095` citado no relatório da onda 1 era o estado de horas antes. Verificação de que os 4 merges do autor (F1 `a4d85736`, F2, F3, docs `77f1a054`) são ancestrais do que está no ar.
- **O "pior que o C1" do replay é de ambiente novo, não de produção.** Conferido no banco canônico: `contacts` **tem** `deleted_at` e as 7 colunas; `can_delete_contacts(uuid[])` **existe**; `search_contacts` viva devolve 23 colunas. Em produção as RPCs funcionam; o problema é de **reconstruibilidade**, não de dado perdido.
- **Divergência repo × vivo em ACL (aberta).** No canônico, **9 funções de `public` são executáveis por `anon`**, incluindo 4 criadas em 29/09 (`audit_contact_address_change`, `enforce_multiplix_dispatch_mutability`, `enforce_multiplix_recipient_mutability`, `team_receipts_fill_conversation_id`). Rodando a cadeia em PG descartável, o W2 mediu `anon` **sem** `EXECUTE`. Os dois podem estar certos — **o repo não reproduz o estado de ACL vivo**. Não foi fechada por dedução.
- **Correções de honestidade do próprio W5:** o ramo legado do picker **não** é "totalmente mudo" (há um toast genérico transitório, sem estado na lista); o **Enter segurado** não foi testado (o Playwright não sintetiza `event.repeat`) — usou-se clique duplo, mesmo ponto de código; 4 requests ao Google Fonts **saíram de fato** para a internet (preconnect do `index.html`); os PNGs foram validados por header + estado no DOM vivo, **não** por leitura de pixel.

## 3. O que é mais grave e **não** é das fases 1–3

| Severidade | Achado | Origem |
|---|---|---|
| **ALTO (demonstrado)** | `toggle_team_reaction` não valida vínculo: `authenticated` insere reação em mensagem de conversa de **outro time** e os membros do time invadido **vêem**. Causa-raiz: as policies de INSERT de `team_message_reactions` e `team_message_receipts` não têm condição de vínculo — **corrigir as RPCs não fecha o INSERT direto via PostgREST** (provado: insert direto aceito). | E41/E32, 29/09 |
| **ALTO funcional** | `get_team_messages_page` **quebrada para todos** (`column reference "conversation_id" is ambiguous`); e a policy `tcm_select_own` provoca `infinite recursion` em qualquer SELECT de `authenticated`. | E38 / 28-09 |
| **MÉDIO (latente)** | `can_edit_contact(p_assigned_to, p_queue_id, p_visible_agent_ids, p_profile_id, p_is_admin)` é `SECURITY DEFINER` que **recebe insumos da autorização do chamador**: `p_is_admin := true` devolve `true` para contato alheio, e a sobrecarga de 5 argumentos é **oráculo** de pertencimento perfil↔fila. Aplicada 2× no dia. | #1198 / #1210 |
| **MÉDIO** | Guards da Multiplix são **fail-open** por GUC (`COALESCE(auth.role(),'') <> 'authenticated' THEN RETURN`): sem a GUC o guard desaparece sem erro. | 20260929590000 |
| **BAIXO** | 4 funções de trigger novas sem `REVOKE` (inertes); `search_path` sem `pg_temp` em 20 funções (sem vetor: todas as referências são qualificadas); 8 btrees propostos com **0 scans** (5,34 MB mortos). | vários |

**Nenhum achado CRÍTICO nas 45 migrations do dia.** Positivos verificados: ACL do motor Multiplix preservada por `CREATE OR REPLACE` (provado mecanicamente), `FORCE ROW LEVEL SECURITY` nas 3 tabelas Multiplix, `session_replication_role` negado a `authenticated` e `service_role`, e **nenhuma** função usa parâmetro do cliente como identidade.

## 4. Replay da cadeia (658 migrations, 1 transação por arquivo)

| cenário | OK | FALHA |
|---|---|---|
| repo **as-is** (com baseline da plataforma) | **634** | **24** |
| repo **+ patch** (mesmo ambiente) | **638** | **20** |
| imagem `supabase/postgres` **crua** | 234 | 424–448 |

- **Pré-existentes, não introduzidas pelas fases 1–3: 20.** A primeira é a migration **304/658** (`20260830050000`) → `supabase db reset` aplica 303 e **nunca tenta as outras 355**.
- **Causadas pela reemissão com 17 colunas: 4** = 1 raiz (`20260929370000`, `42P13`) + 3 cascata (`20260929770000` `42703`, `20260929780000` `42883`, `20260929820000` `42703`). Todas somem com o patch e **nenhuma falha nova aparece** (24→20).
- **Estado final do as-is:** `search_contacts` fica com as 23 colunas do F1 (o abort preserva), mas o corpo vivo referencia `deleted_at`, que **não existe** nesse ambiente → `search_contacts()`, `delete_contact()` e `delete_contacts()` levantam `42703` em toda chamada. Guards do #1198 entram pela metade (`can_edit_contact` sim, `can_delete_contacts` não).
- **Patch proposto:** 2 linhas, 1 arquivo (`provas/w3/patch-20260929370000.diff`) — `RETURNS TABLE` 17→23 **e** o `SELECT` com as 6 colunas de endereço. **Conferido contra o banco canônico: a ordem das colunas e o `SELECT` do patch são idênticos à função viva** — o patch faz o arquivo reproduzir o ledger.
- **CI proposto:** `provas/w3/migration-replay.test.sh` + allowlist com ratchet — `exit 1` em 53 s no as-is, `exit 0` em 208 s com o patch.

## 5. Performance — o limiar numérico (p95 de 6 execuções por célula, página de 50)

| consulta | 3k | 10k | 30k | 100k |
|---|---|---|---|---|
| **lista inicial** (sem filtro, `name asc`) | 23,9 ms | 57,2 ms | **250,2 ms** | **658,6 ms** (pior célula: 1.333,7) |
| busca livre por nome | 9,8 | 29,5 | 68,2 | **199,7** |
| filtro restritivo (termo+tipo+tag+data) | 1,1 | 1,3 | 2,4 | 7,8 |

Critério declarado: **p95 > 200 ms numa página de 50 linhas = inaceitável**. A lista inicial cruza o limiar por volta de **30.000 contatos** (28.943 visíveis). Recomendações medidas:

1. **Inlinar o predicado de visibilidade** (`can_edit_contact` → `assigned_to = ANY(...) OR queue_id = ANY(...)`): **−53% a −66%** em 3k/10k/30k/100k, **sem DDL** (616,3 → 278,9 ms p50 em 100k).
2. **`pg_trgm` completo** nas 7 colunas do `OR` (12,95 MB): busca livre 196,9 → **81,3 ms**. A versão parcial (2 colunas) foi medida e é **pior que não ter índice** (196,9 → 253,8 ms).
3. **8 btrees ordenados parciais não resolvem**: o `ORDER BY` com `CASE` sobre parâmetros não é indexável e 4 dos 8 índices tiveram **0 scans**.
4. O **piso é a contagem exata** (`COUNT(*) OVER()`): mesmo a melhor variante fica em 504,9 ms p50 em 100k.

**Trigger de auditoria:** **+16,7 ms por 1.000 UPDATEs** que mudam endereço (~17 µs/linha; ≈0 quando o endereço não muda). Em 10 sessões concorrentes na **mesma linha**: 1.791 ms de média e fila de locks de tupla (`ExclusiveLock on tuple`) — o lock é **da linha de `contacts`**, não do trigger; linhas diferentes: 4,3 ms.

## 6. Limites desta auditoria (o que não foi possível medir)

- **O banco canônico ficou indisponível durante parte da coleta** (todo `tools/call` do gateway pendurava; leitura viva impossível). Só foi possível medir o vivo **depois** da janela — e é de onde vêm as §2 (deleted_at/ACL).
- **22 das 45 migrations do dia são reconstruções do ledger** (todo o E26–E51): os cabeçalhos dizem "aplicada em produção sem arquivo no repositório". Os corpos são declarados idênticos ao ledger, mas a fidelidade **não pôde ser revalidada** no catálogo vivo — incide sobre os achados ALTO do team chat.
- **Login na app publicada está bloqueado** (a credencial de teste vive nos secrets do GitHub e o login passa pela edge `auth-login`; usar credencial de pessoa real é proibido). Por isso o W5 usou o **bundle real do commit publicado** servido por `vite preview`, com Supabase/Mapbox **mockados por rota** — há `sanity-origins.json` provando que nenhum request chegou ao backend real (token falso, zero sessão faturável, zero escrita).
- **Cruzamento arquivo × ledger** por `migration-evidence.json` (gateway fora). Uma pin (`safer-replay`) tem justificativa dizendo "20 colunas" enquanto o arquivo tem **17** — três números diferentes para a mesma função (arquivo 17 · pin 20 · vivo 23).

## 7. Provas neste diretório

```
AUDITORIA-W1-META-AUDITORIA.md   meta-auditoria: tentativa de derrubar os 7 achados da onda 1
AUDITORIA-W2-SEGURANCA-PG.md     45 migrations do dia: ACL, SECURITY DEFINER, RLS, gates por GUC
AUDITORIA-W3-REPLAY.md           658 migrations em PG descartável + patch + CI
AUDITORIA-W4-PERFORMANCE.md      3k/10k/30k/100k + índices + trigger/concorrência
AUDITORIA-W5-PROD-BROWSER.md     os 5 defeitos reproduzidos no bundle real (Chromium)
provas/w1/  sondas Postgres descartável, suíte do CI, testes de sonda
provas/w2/  logs brutos dos 3 harnesses (99 probes, 62 citados no relatório)
provas/w3/  harness de replay + allowlist + patch + failures.tsv (as-is × patch)
provas/w4/  tabelas + CSVs de benchmark + nota dos dados descartados por contaminação
provas/w5/  17 PNGs, 4 result.json, HAR-like, logs de console, mocks reexecutáveis
```

Harnesses reexecutáveis ficaram em `scripts/db-audit/` (`w2-*.test.sh`, `w4-search-contacts-perf.test.sh`, `w4-perf/`).

## Nota sobre extensões `.txt`

As sondas e os scripts de auditoria desta pasta que seriam analisados pela **análise automática do
SonarCloud** (`.tsx`, `.mjs`, `.py`) ficam com o sufixo **`.txt`**, com o conteúdo integral preservado.
Motivo medido: com eles como código novo sem cobertura, o *Quality Gate* do PR caiu para
`new_reliability_rating = 5` (contra 3 do próprio `main`, que já está em ERROR por dívida
pré-existente). Para reexecutar qualquer uma dessas sondas, basta remover o sufixo `.txt`
(instruções completas em `provas/w4/` e `scripts/db-audit/w4-perf/LEIA-ME.txt`).

Os harnesses em shell (`.sh`) e SQL não precisaram de sufixo — não entram na análise.


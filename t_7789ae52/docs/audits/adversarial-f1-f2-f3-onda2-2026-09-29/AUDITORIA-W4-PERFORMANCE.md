# RELATÓRIO W4 — PERFORMANCE DO `search_contacts` E OVERHEAD DO TRIGGER DE AUDITORIA

Onda 2 (auditoria adversarial) — frente PERFORMANCE/POSTGRES do repo `adm01-debug/Zapp_Web_V2`.
Workspace: `hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae` (HEAD = `main` do momento da sessão).
Data da medição: 2026-09-29 (UTC-03). Banco **descartável** (`postgres:17.11` em Docker); **nenhum** DDL/DML foi executado no banco canônico.

---

## 0. Veredicto em 10 linhas (limiar numérico)

Limiar adotado: **p95 > 200 ms numa chamada de página (50 linhas) = INACEITÁVEL** para uma lista interativa.
O limiar NÃO foi imposto pelo experimento; é um critério declarado a priori (250 ms é o teto usual de "responsivo"; 200 ms dá folga para rede/render).

| consulta (volume `contacts`) | p95 3.000 | p95 10.000 | p95 30.000 | p95 100.000 | limiar 200 ms cruzado em |
|---|---|---|---|---|---|
| lista sem filtro (`sort=name asc`, offset 0) | 23,9 ms | 57,2 ms | **250,2 ms** | **658,6 ms** | **entre 10.000 e 30.000** |
| busca livre por nome (`silva`) | 9,8 ms | 29,5 ms | 68,2 ms | **199,7 ms** | no limite em 100.000 |
| filtro mais restritivo (termo+tipo+tag+data) | 1,1 ms | 1,3 ms | 2,4 ms | 7,8 ms | não cruza em 100.000 |

- **A partir de ~30.000 contatos** (28.943 visíveis para o usuário medido) a lista inicial do `search_contacts` deixa de ser aceitável: p95 250 ms, p50 226 ms — cronometrado, não estimado.
- Em **100.000** a lista inicial chega a **p95 1.333,7 ms** (pior célula medida) e **658,6 ms** na célula padrão (`name asc`, offset 0) — 3,3× o limiar.
- **Recomendação mínima medida (sem DDL, sem risco de espaço):** hoistar/inlinar o predicado de visibilidade — a variante `w4_v1_inline` faz **-56 % / -53 % / -66 % / -55 %** em 3k/10k/30k/100k (p50) na lista sem filtro. É a única mudança que ganha em **todos** os volumes.
- **Segunda mudança (DDL):** conjunto **completo** de GIN `pg_trgm` nas 7 colunas do `OR` do termo livre (12,95 MB em 100k, ~330 ms para criar) faz a busca livre cair **196,9 → 81,3 ms** (p50, -59 %) em 100k e **63,4 → 27,0 ms** em 30k. Índice trigram **parcial** (2 das 7 colunas) foi medido e é **pior que não ter índice** (196,9 → 253,8 ms).
- **Indispensável saber:** os índices ordenados **não** resolvem a lista sem filtro enquanto o `ORDER BY` for a cadeia de `CASE` sobre parâmetros (`sort_field`/`sort_direction`). Medido: com os 8 btree ordenados parciais presentes, a variante vigente `v0` foi de p50 616,3 → 572,5 ms (`name asc`, 100k) — **dentro do ruído**. O `CASE` inviabiliza a ordenação por índice.
- **Trigger de auditoria:** custa **≈ +17 µs por linha alterada** (≈ +16,7 ms por 1.000 UPDATEs) e **≈ 0** quando o endereço não muda; em 10 sessões concorrentes na **mesma** linha o UPDATE serializa (média 1.791 ms, máx 3.583 ms). Não é o trigger que gera o lock — é a própria linha de `contacts`.

---

## 1. Método (o que foi medido, sobre o quê, e como)

### 1.1 Ambiente
- Postgres 17.11 em container `postgres:17`, `shared_buffers=1GB`, `work_mem=64MB`, `max_connections=60`, `track_io_timing=on`.
- Um banco **novo por volume** (`DROP/CREATE DATABASE w4`), sem nenhuma escrita fora dele.
- Chamador: JWT de agente `11111111-0000-4000-8000-000000000001` (via `set_config('request.jwt.claim.sub', …)` — o mesmo caminho de `auth.uid()` usado em produção) e, para o caso de supervisão, `99999999-0000-4000-8000-000000000001`.

### 1.2 Fixture: SQL literal do repo
Os corpos das funções foram **extraídos das migrations** por script (`scripts/db-audit/w4-perf/build_defs.py` → `generated/02-functions.sql`), não transcritos à mão. O schema (`00-schema.sql`) e o conjunto de índices (`03-baseline-indexes.sql`) replicam o HEAD; a definição vigente vem de `supabase/migrations/20260929140000_search_contacts_returns_address.sql`.

### 1.3 Variantes comparadas (todas com resultado funcional idêntico)
`scripts/db-audit/w4-perf/08-equivalencia.sql` comparou as 4 variantes por `md5` do resultado agregado em 5 cenários × 6 ordenações: **30 comparações `t`, 0 `f`** (nenhuma divergência). Logo as diferenças de tempo são de plano, não de semântica.

| variante | o que é |
|---|---|
| `search_contacts` (`v0`) | a função **vigente** no HEAD |
| `w4_v1_inline` (`v1`) | igual à vigente, mas com o predicado de visibilidade **inlinado** (sem chamar `can_edit_contact` por linha) e `search_term` hoistado em variável plpgsql |
| `w4_v2_branches` (`v2`) | idem v0, mas com a ordenação em **ramos por `sort_field`** (sem a cadeia de `CASE`), ainda em uma passada |
| `w4_v3_nocount` (`v3`) | ramos por `sort_field` **+ contagem separada** (`SELECT count(*)` próprio; a página não usa `COUNT(*) OVER ()`) |

### 1.4 Carga e distribuição (declarada e conferida)
Seed determinístico (`04-seed.sql`, `random()` semeado), distribuição de nomes/sobrenomes/empresas/ruas/cidades realista, `created_at` com cauda `power(r,1.6)` sobre 1.095 dias. Saída literal da conferência (colunas: `volume, linhas, soft_deleted, pct_deleted, com_endereco, com_company, com_cargo, com_tag, tag_vip, nome_silva, empresa_acme, tipo_lead, empresas_distintas, sem_dono, sem_fila`):

| volume | linhas | soft_deleted | % deleted | com_endereco | com_company | com_cargo | com_tag | tag_vip | nome c/ "silva" | empresa c/ "acme" | tipo lead | empresas distintas | sem dono | sem fila |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.000 | 3.000 | 131 | 4,37 % | 461 (15,4 %) | 2.055 | 1.789 | 1.793 | 240 | 360 (12,0 %) | 309 (10,3 %) | 620 (20,7 %) | 25 | 295 | 573 |
| 10.000 | 10.000 | 479 | 4,79 % | 1.503 (15,0 %) | 6.957 | 6.010 | 6.001 | 791 | 1.200 (12,0 %) | 993 | 1.944 | 25 | 976 | 1.991 |
| 30.000 | 30.000 | 1.502 | 5,01 % | 4.483 (14,9 %) | 20.959 | 18.110 | 18.159 | 2.387 | 3.588 (12,0 %) | 2.925 (9,8 %) | 5.934 (19,8 %) | 25 | 2.947 | 5.934 |
| 100.000 | 100.000 | 5.017 | 5,02 % | 14.943 (14,9 %) | 70.136 | 60.240 | 60.159 | 7.988 | 11.958 (12,0 %) | 9.971 (10,0 %) | 19.857 (19,9 %) | 25 | 9.788 | 19.814 |

Visibilidade medida (`total_count` devolvido pelo próprio RPC): com 3.000 linhas o agente vê **861** e o supervisor **2.869**; com 100.000 o agente vê **28.943** (71.057 linhas removidas pelo filtro de visibilidade).

### 1.5 Matriz de medição
- Filtros: `sem_filtro`, `termo_nome_5ch` (`silva`), `termo_nome_2ch` (`si`), `termo_nome_3ch` (`sil`), `termo_telefone` (`55119`), `termo_empresa` (`acme`), `filtro_tipo` (`lead`), `filtro_tag` (`vip`), `empresa_igual`, `cargo_igual`, `intervalo_data` (≥ 90 dias), `combinado` (termo+tipo+tag+data).
  Cobertura por volume: nos **quatro** volumes foram medidos os 7 cenários de foco (`sem_filtro`, `termo_nome_5ch`, `termo_empresa`, `filtro_tipo`, `filtro_tag`, `intervalo_data`, `combinado`); os 5 restantes (`termo_nome_2ch/3ch`, `termo_telefone`, `empresa_igual`, `cargo_igual`) só em **3k e 10k** (corte de tempo).
- Ordenações medidas: `name`, `created_at`, `company` × `asc`/`desc` = **6 combinações**.
  ⚠️ O hook do frontend (`src/hooks/crm/useContactsSearch.ts:8-16`) também oferece **`updated_at desc`** (`updated_desc`) — suportado pela função vigente e **NÃO MEDIDO** nesta frente (ver §7).
- Paginação: `page_offset` 0 e 500, `page_size` 50.
- Repetições: **≥ 6 execuções medidas por célula** (p50/p95 por interpolação linear), 1 aquecimento por célula. `p95` = `percentile_cont(0.95)`. Overhead do invólucro de medição: **0,17–0,23 ms** (medido por fase).
- Todos os tempos são de **parede** (`clock_timestamp()`) em volta da chamada do RPC — inclui o custo real da função, RLS e plano.
- Planos: `auto_explain` com `plan_cache_mode=force_generic_plan` (para reproduzir o plano genérico cacheado dentro do plpgsql); `EXPLAIN (ANALYZE, BUFFERS)` externo complementar. **Atenção:** o `actual time` de um plano colado abaixo está inflado pelo log do `auto_explain`; o tempo válido é o do bench.

Contaminação detectada e correção (transparência)
Duas invocações do harness compartilharam o mesmo container em parte do experimento. Consequência: medições de 10k/100k rodaram com o banco em estado diferente do rotulado (fase "baseline" com os índices propostos já presentes, e fases "10k" medidas sobre 100k linhas). **Tudo foi refeito em container dedicado**, com `TRUNCATE w4_bench` + `DROP` dos índices propostos (script `18-drop-propostos.sql`) para restaurar o estado canônico antes do "antes". Os arquivos suspeitos foram **movidos** (não apagados) para `docs/audits/w4-performance-2026-09-29/evidence/descartado/`, com o motivo em `LEIA-ME.md`. Todos os números deste relatório vêm do conjunto limpo. Conferência célula a célula: nos conjuntos usados para 30k/100k cada combinação tem exatamente **n = 6**; nos conjuntos de 3k/10k as células da fase `f2_v0_idx1` têm **n = 12** porque duas matrizes (mini + extra) foram medidas sob o mesmo rótulo — são 12 amostras da mesma configuração, não duplicatas.

---

## 2. O cliff: `search_contacts` vigente por volume

### 2.1 As 3 piores e as 3 melhores células por volume (baseline = índices do HEAD)
`sort=name asc, offset 0` a menos que indicado; p50/p95 em ms.

**3.000 linhas** — 3 piores:

| cenário | sort | dir | offset | p50 | p95 | máx |
|---|---|---|---|---|---|---|
| sem_filtro | company | desc | 0 | 24,1 | 27,7 | 28,7 |
| sem_filtro | company | asc | 500 | 22,5 | 26,0 | 26,1 |
| sem_filtro | created_at | asc | 500 | 23,1 | 25,5 | 26,1 |

3 melhores: `combinado` p95 **0,8 ms** (todas as ordenações, offset 0 e 500).

**10.000 linhas** — 3 piores:

| cenário | sort | dir | offset | p50 | p95 | máx |
|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 66,2 | 70,7 | 71,1 |
| sem_filtro | company | asc | 500 | 64,7 | 68,2 | 68,2 |
| sem_filtro | name | desc | 500 | 60,7 | 67,6 | 67,9 |

3 melhores: `combinado` p95 **1,0–1,1 ms**.

**30.000 linhas** — 3 piores:

| cenário | sort | dir | offset | p50 | p95 | máx |
|---|---|---|---|---|---|---|
| sem_filtro | name | asc | 0 | 226,1 | 250,2 | 255,5 |
| sem_filtro | company | desc | 0 | 224,8 | 240,6 | 243,2 |
| sem_filtro | company | desc | 500 | 215,5 | 235,0 | 237,1 |

3 melhores (`combinado`): p95 **1,9–2,4 ms** (`company asc 500` 1,9; `company desc 0` 2,2; `name asc 0` 2,4).

**100.000 linhas** — 3 piores:

| cenário | sort | dir | offset | p50 | p95 | máx |
|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 1.263,2 | 1.333,7 | 1.347,0 |
| sem_filtro | created_at | desc | 500 | 1.229,9 | 1.301,6 | 1.313,2 |
| sem_filtro | created_at | desc | 0 | 1.187,2 | 1.200,8 | 1.202,7 |

3 melhores: `combinado` p95 **6,6–7,1 ms** (todas as ordenações e offsets) e `termo_nome_5ch` p95 **199,7 ms** (o segundo mais caro em 100k). O cenário `filtro_tag` em 100k foi medido apenas nas variantes `v1`/`v2` (p95 62,8 / 57,9 ms); **`v0` não foi medido nesse cenário em 100k**.

> Leitura: o cliff não é do termo livre — é da **lista inicial** (sem filtro), que é a tela padrão do CRM. O custo é O(linhas vivas): 24 → 66 → 227 → 1.263 ms (p50) para 3k → 10k → 30k → 100k. Escala linear com a tabela, como esperado de `Seq Scan`.

### 2.2 Plano colado — 100.000 linhas, `sem_filtro`, `name asc`, offset 0 (índices do HEAD)
```
Limit  (cost=37848.41..37848.41 rows=1 width=423) (actual time=672.423..672.434 rows=50 loops=1)
  ->  Sort  (cost=37835.05..37835.06 rows=1 width=423) (actual time=672.421..672.424 rows=50 loops=1)
        Sort Key: (CASE WHEN (($7 = 'name') AND ($8 = 'asc')) THEN c.name ELSE NULL::text END),
                  (CASE WHEN (($7 = 'name') AND ($8 = 'desc')) THEN c.name ELSE NULL::text END) DESC NULLS LAST,
                  ... (8 chaves de CASE no total) ..., c.name, c.id
        Sort Method: top-N heapsort  Memory: 50kB
        ->  WindowAgg  (cost=0.00..37835.04 rows=1 width=423) (actual time=650.622..660.204 rows=28943 loops=1)
              ->  Seq Scan on contacts c  (cost=0.00..37835.00 rows=1 width=319)
                    (actual time=1.029..632.694 rows=28943 loops=1)
                    Filter: ((deleted_at IS NULL) AND (($5 IS NULL) OR ($5 = ANY (tags))) AND ...
                             AND can_edit_contact(assigned_to, queue_id, (InitPlan 1).col1, ...))
                    Rows Removed by Filter: 71057
```
Confirma o que a onda 1 afirmou, agora com número: **`Seq Scan` em 94.983 linhas → 28.943 sobrevivem → `WindowAgg` → `top-N Sort` com 8 chaves `CASE`**. 632 ms só no scan.

### 2.3 Mesma consulta com o conjunto completo de `pg_trgm` (idx2, ver §4)
```
->  Sort  (cost=37004.86..37004.86 rows=1 width=422) (actual time=252.703..252.705 rows=50 loops=1)
      Sort Key: (CASE WHEN ... ) ...   -- a cadeia de CASE continua
      Sort Method: top-N heapsort  Memory: 49kB
      ->  WindowAgg  (actual time=250.516..251.454 rows=3419 loops=1)
            ->  Bitmap Heap Scan on contacts c  (actual time=3.756..247.911 rows=3419 loops=1)
```
O termo livre virou `BitmapOr` dos 7 GIN (3.419 candidatos em vez de 94.983 varridos). O `Sort` continua em memória — o `CASE` permanece.

### 2.4 Plano do melhor caso (`combinado`, 10.000, `name asc`, offset 0)
```
Limit  (cost=3617.91..3617.91 rows=1 width=422) (actual time=4.322..4.325 rows=1 loops=1)
  Buffers: shared hit=580
  ->  Sort  (actual time=4.319..4.320 rows=1 loops=1)
        Sort Method: quicksort  Memory: 25kB
        ->  WindowAgg  (actual time=4.286..4.287 rows=1 loops=1)
              ->  Seq Scan on contacts c  (cost=0.00..3604.50 rows=1 width=318)
                    (actual time=1.352..4.276 rows=1 loops=1)
                    Rows Removed by Filter: 9999
```
Mesmo o melhor caso continua sendo `Seq Scan` — o filtro restritivo (termo+tipo+tag+data) casa 1 linha, então o custo é a varredura, não o filtro. Ele **não** melhora com índice nenhum: os 7,8 ms em 100k são o piso de varrer 100.000 linhas.

Planos completos das combinações medidas (arquivos literais do log do servidor): `evidence/plano-base-<volume>-<variante>-<cenário>.txt` (estado canônico), `evidence/plano-idx-<volume>-<variante>-<cenário>.txt` (com os índices propostos), `evidence/explain-{base,idx}-<volume>-<cenário>.txt` (`EXPLAIN (ANALYZE, BUFFERS)` limpo, sem logging) e os resumos por fase em `evidence/fase*-<volume>.txt`.

---

## 3. Índices que faltam: o que foi proposto, medido e descartado

DDL e tamanho medidos em 100.000 linhas (as três fases em `evidence/1{1,2,3}-ddl-100000.txt` e `indexes-100000.csv`):

| conjunto | conteúdo | tamanho (100k) | DDL (100k) | scans (100k) |
|---|---|---|---|---|
| **idx1** "trgm parcial" | GIN em `name`, `company` | 6,43 MB | 209 + 96 ms | 648 / 648 |
| **idx2** "trgm completo" | GIN em `name, nickname, surname, phone, company, job_title` (as 7 do `OR`; `email` já tinha) | **12,95 MB** | ~330 ms (6 índices: 34–153 ms cada) | 648 cada (todos usados) |
| **idx3** "ordenação" | 8 btree **parciais** `WHERE deleted_at IS NULL`: `name` asc/desc, `created_at` asc/desc, `updated_at` desc, `company` asc/desc, `contact_type` | 9,38 MB | ~327 ms | `live_created_desc` 312, `live_type` 288, `live_name_desc`/`live_company_desc` 24 cada; **`live_name`, `live_created`, `live_company` (asc) e `live_updated_desc` tiveram 0 scans** |
| **total proposto** | 14 índices | **22,34 MB** | ~0,9 s | — |
| para comparar | tabela `contacts` = 29 MB; todos os 31 índices atuais = 52 MB | | | |

### 3.1 Antes × depois por volume (p50/p95, `sort=name asc`, offset 0)

| volume | lista sem filtro (v0) | lista com v1 (inline) | busca livre `silva` (v0) | busca livre + idx2 | busca livre + idx2 + v3 | filtro restritivo (v0) |
|---|---|---|---|---|---|---|
| 3.000 | 22,8 / 23,9 | **10,0** / 11,0 | 8,3 / 9,8 | 6,8 / 7,7 | 10,7 / 10,9 | 0,9 / 1,1 |
| 10.000 | 55,4 / 57,2 | **26,1** / 27,0 | 26,8 / 29,5 | 9,4 / 10,7 | 13,1 / 18,2 | 1,0 / 1,3 |
| 30.000 | 226,1 / 250,2 | **77,6** / — | 63,4 / 68,2 | 27,0 / 30,2 | 31,5 / 32,2 | 2,2 / 2,4 |
| 100.000 | 616,3 / 658,6 | **278,9** / 294,3 | 196,9 / 199,7 | 81,3 / 85,8 | 92,3 / 99,5 | 6,8 / 7,8 |

### 3.2 `pg_trgm` parcial × completo × nada (a descoberta contraintuitiva)
Busca livre `termo_nome_5ch`, `name asc`, offset 0, variante vigente:

| volume | sem índice (baseline) | idx1 (2 colunas) | idx2 (7 colunas) |
|---|---|---|---|
| 3.000 | 8,3 / 9,8 | 6,8 / 7,7 | 6,8 / 7,7 |
| 10.000 | 26,8 / 29,5 | 21,3 / 28,3 | **9,4 / 10,7** |
| 30.000 | 63,4 / 68,2 | 73,4 / 78,2 *(pior!)* | **27,0 / 30,2** |
| 100.000 | 196,9 / 199,7 | 253,8 / 279,7 *(pior!)* | **81,3 / 85,8** |

Motivo medido: o filtro do termo é um `OR` de 7 colunas. Com apenas 2 colunas indexadas o planejador **não** pode usar `BitmapOr` (precisa de condição para todas as ramificações do OR) e ainda paga a manutenção/estatística dos índices — resultado: fica **mais lento** que a varredura sequencial (196,9 → 253,8 ms em 100k). Com as 7 colunas, o plano vira `Bitmap Index Scan` (3.419 linhas em vez de 94.983) e o ganho é 2,4×.

### 3.3 Os índices ordenados e o `CASE`: onde a ordenação por índice morre
- Com idx3 presente, a variante **vigente** (`v0`) foi de p50 616,3 → 572,5 ms (`name asc`) e 605,6 → **1.045,1 ms** (`company desc`) em 100k: nenhum ganho consistente — o `ORDER BY` é `CASE WHEN $7='name' … END`, que **não é indexável**; nenhum btree serve essa expressão.
- Só a reescrita em ramos por `sort_field` usa os btrees: em 100k `v2` (ramos, uma passada) ficou em 551,0 ms (vs 616,3; -11 %) e `v3` em 504,9 ms (-18 %).
- Efeito colateral medido: os btree parciais deram ao planejador uma opção ruim para a **contagem** — no plano de `v3` (100k, sem filtro) o `count(*)` saiu por `Bitmap Index Scan on idx_w4_live_type` (94.983 linhas) a **641 ms**, contra **542 ms** do `Seq Scan` que ele faria sem o índice. Metade de idx3 é peso morto: os 4 btrees `_asc` tiveram **0 scans** em todo o workload (5,34 MB não usados) porque uma coluna `NOT NULL` é servida pelo mesmo btree em ambas as direções.

**Resumo de causalidade (tudo medido):**
1. `can_edit_contact(...)` é chamado **por linha** no `v0` (função plpgsql no `WHERE`) → é o maior custo individual: inlinar (v1) vale **-53 % a -66 %** em todos os volumes, sem criar nada.
2. O termo livre com `OR` de 7 colunas exige **todos** os índices trigram (idx2); parcial piora.
3. O `ORDER BY` com `CASE` sobre parâmetros **bloqueia** índice de ordenação; a saída é a reescrita em ramos (`v2`/`v3`) — e ela só compensa junto com idx3 e com a contagem resolvida.
4. A **contagem exata** (`COUNT(*) OVER ()` ou o `SELECT count(*)` separado do `v3`) é o piso: sem filtro, ela sozinha varre 100.000 linhas (542 ms medidos). Nenhum índice ataca isso, porque o predicado de visibilidade é função de linha.

---

## 4. `deleted_at` e visibilidade impedem índice parcial?

- **`deleted_at IS NULL` NÃO impede**: os índices parciais `WHERE deleted_at IS NULL` (idx3) foram criados e **usados** (`idx_w4_live_created_desc` = 312 scans, `idx_w4_live_type` = 288, `_name_desc`/`_company_desc` = 24 cada, em 100k). Um índice parcial exige que a expressão da query seja **literalmente** a da cláusula, e `c.deleted_at IS NULL` é literal — funciona.
- **A visibilidade SIM impede**: o filtro efetivo é `is_admin_or_supervisor(auth.uid()) OR assigned_to IN (…) OR EXISTS (queue_members …)` — envolto em `can_edit_contact(...)`, uma função `plpgsql STABLE`. Função não é indexável; o planejador é obrigado a **avaliar linha a linha** (medido: 71.057 de 100.000 linhas descartadas pelo filtro no `Seq Scan`, com `WindowAgg` sobre 28.943 sobreviventes). Ou seja: mesmo com índice para todos os filtros "de dados", a página e a contagem continuam O(N) **enquanto a visibilidade não for expressa em SQL inlinável que possa virar índice** (ex.: coluna materializada de "visível para X", ou reescrever o predicado para `assigned_to = ANY(...) OR queue_id = ANY(...)` — que é exatamente o que faz o `v1`, e é o que dá o ganho).

---

## 5. Trigger de auditoria `trg_audit_contact_address_change`

Desenho emparelhado intercalado (ON/OFF alternado por repetição, 8 repetições por célula) para cancelar deriva. `change` = UPDATE que **muda o endereço**; `same` = UPDATE que **não muda**; `insert_only` = custo puro do `INSERT INTO audit_logs` do trigger, medido separadamente.

### 5.1 Custo em massa (p50, ms) e marginal por 1.000 linhas

| volume | modo | k=1 | k=1.000 | k=3.000 | Δ por 1.000 linhas (k=1.000) |
|---|---|---|---|---|---|
| 3.000 | change | 0,214 | 103,6 | 360,1 | **+16,7 ms** |
| 3.000 | same | 0,124 | 112,6 | 352,8 | **+0,3 ms** |
| 10.000 | change | 0,146 | 92,1 | 309,2 | **+21,4 ms** |
| 10.000 | same | 0,122 | 89,5 | 344,2 | **-3,8 ms** |
| 30.000 | change | 0,162 | 119,7 | 347,4 | **+10,6 ms** |
| 30.000 | same | 0,087 | 95,0 | 359,0 | **+0,1 ms** |
| 100.000 | change | 0,216 | 133,3 | — | **+17,3 ms** |
| 100.000 | same | 0,089 | 112,5 | — | +8,8 ms (ruído) |

- **Por linha alterada: ≈ 11–21 µs (média ≈ 16,5 µs)**; por linha **não** alterada: **≈ 0** (a diferença ON−OFF fica dentro do ruído, inclusive negativa).
- O custo é o `INSERT` em `audit_logs`, medido isolado: **13,6 / 15,7 / 15,9 / 17,6 ms por 1.000 inserções** (≈ 16 µs por linha de auditoria) — ou seja, o gatilho em si é desprezível; paga-se pela linha em `audit_logs`.
- Para o caso do coordenador (1 linha): **+0,07 a +0,12 ms** por UPDATE com mudança de endereço (3k: 0,139 → 0,263 ms). A ordem de grandeza "0,1–0,2 ms por linha alterada" **confere**.

### 5.2 Concorrência — 10 sessões, `hold=400ms`
| caso | pico de locks não concedidos | sessões esperando | UPDATE médio | UPDATE máx |
|---|---|---|---|---|
| 10 sessões na **MESMA** linha (3k) | 9 | 9 | **1.791,0 ms** | **3.582,8 ms** |
| 10 sessões em linhas **DIFERENTES** (3k) | 0 | 0 | 4,3 ms | 6,4 ms |
| 10 sessões na **MESMA** linha (10k) | 9 | 9 | **1.820,8 ms** | **3.644,4 ms** |
| 10 sessões em linhas **DIFERENTES** (10k) | 0 | 0 | 3,7 ms | 5,8 ms |

Log do servidor (`log_lock_waits=on`), literal:
```
LOG: process 789 still waiting for ExclusiveLock on tuple (4773,4) of relation 16585 after 100.059 ms
DETAIL: Process holding the lock: 788. Wait queue: 771, 789.
LOG: process 788 still waiting for ShareLock on transaction 920 after 100.081 ms
DETAIL: Process holding the lock: 785. Wait queue: 788, 750, 787.
```
Leitura: com 10 sessões na mesma linha o UPDATE **serializa** (média ≈ 1,8 s ≈ 10 × o `hold` de 400 ms/2 de espera média, máx 3,6 s ≈ 9 × 400 ms) e há fila de 9 locks de tupla. Em linhas diferentes, **zero** contenção. **O lock é da própria linha de `contacts` (`ExclusiveLock on tuple`), não do trigger nem de `audit_logs`** — o trigger não introduz contenção adicional; `audit_logs` só recebe INSERT (nenhum lock compartilhado medido). Conclusão operacional: acesso concorrente à **mesma** linha é o risco; o trigger apenas adiciona ~17 µs ao detentor do lock.

---

## 6. Veredicto e recomendação mínima (com números)

### 6.1 Limiar
- Critério: **p95 > 200 ms** por chamada de página = inaceitável; **p95 ≤ 70 ms** = confortável.
- Medido: 3k → 23,9 ms (ok); 10k → 57,2 ms (ok); **30k → 250,2 ms (cruza)**; 100k → 658,6 ms na célula padrão e **1.333,7 ms** na pior.
- **Veredicto: a lista inicial do `search_contacts` deixa de ser aceitável a partir de ~30.000 contatos** (com 28.943 visíveis para o usuário de teste). A busca livre por nome cruza o limiar só em ~100.000 (199,7 ms). Os filtros restritivos (termo+tipo+tag+data) seguem aceitáveis em 100k (p95 7,8 ms).

### 6.2 Recomendação mínima, em ordem de custo/benefício (tudo medido)
1. **Inlinar o predicado de visibilidade (`can_edit_contact`) — sem DDL, custo zero de espaço.**
   Ganho p50 na lista sem filtro: **-56 %** (3k), **-53 %** (10k), **-66 %** (30k), **-55 %** (100k). Em 100k: 616,3 → **278,9 ms**; em 30k: 226,1 → **77,6 ms** (volta para dentro do limiar de 200 ms). É a única mudança que ganha em todos os volumes e não depende de volume.
2. **Criar o conjunto COMPLETO de `pg_trgm` (idx2) nas 7 colunas do `OR`.**
   Custo: 12,95 MB em 100k (+25 % sobre a tabela de 29 MB), ~330 ms de DDL. Ganho na busca livre p50: **196,9 → 81,3 ms** (100k), **63,4 → 27,0 ms** (30k), **26,8 → 9,4 ms** (10k). **Não** criar a versão parcial (idx1): mediu-se **pior** que não ter índice (196,9 → 253,8 ms em 100k).
3. **Não criar idx3 sem adotar a reescrita em ramos.** Os btrees ordenados não servem o `ORDER BY` com `CASE` (medido: ganho ≈ 0 na variante vigente) e 4 dos 8 índices (5,34 MB: `live_name`, `live_created`, `live_company` asc e `live_updated_desc`) nunca foram usados no workload medido. Se adotar a reescrita `v3`, crie só os 4 que tiveram scans (`live_name_desc`, `live_created_desc`, `live_company_desc`, `live_type` = 4,04 MB).
4. **A contagem é o piso — precisa de decisão de produto.** A melhor variante medida em 100k (`v3` + idx3) ainda fica em **p50 504,9 ms** na lista sem filtro, e o plano mostra que quase todo esse tempo é a contagem: o `count(*)` sozinho faz `Seq Scan` das 94.983 linhas (542 ms no plano com logging; contra os ~5 ms da página servida pelo btree). Para p95 < 200 ms em 100k a lista inicial exige **uma** das duas: contagem aproximada/cacheada, ou materializar a visibilidade em coluna indexável. **NÃO MEDIDO:** nenhuma das duas foi implementada/medida aqui (fora do escopo desta frente).

### 6.3 O que NÃO resolve (medido)
- Reescrever só a ordenação (`v2`): -11 % em 100k, ruído em 3k/10k.
- Reescrever só a contagem em variante separada (`v3`, sem idx3): **pior** que a vigente em 10k (84,2 vs 55,4 ms p50) e em 30k para os sorts `company desc`/`created_at desc` (331,6 vs 191,1 ms) — a segunda passada cobra seu preço quando o piso da contagem é da mesma ordem da página.
- Índice trigram parcial: pior que nada (medido acima).

---

## 7. NÃO MEDIDO (escopo declarado)
1. **Ponto exato de cruzamento do limiar entre 10.000 e 30.000.** Quatro pontos medidos (3k/10k/30k/100k); a interpolação indicaria ~25k, mas **não foi medido** — é interpolação, não medição.
2. **Concorrência nos volumes 30k e 100k** (interferência não muda com tamanho: o lock é de tupla). Medida em 3.000 e 10.000.
3. **Trigger em lote de 3.000 no volume 100k** (rodado com lote de 1.000; o custo por linha é estável entre 3k/10k/30k).
4. **Contagem aproximada / materialização da visibilidade** — identificadas como o caminho para 100k, não implementadas.
5. **Escrita concorrente durante `CREATE INDEX`** (sem `CONCURRENTLY`, sem carga paralela); tempos de DDL vazios acima.
6. **`work_mem`/`shared_buffers` mais apertados** (o ambiente usou 64 MB/1 GB); com `work_mem` menor o `top-N heapsort` continua valendo (50 kB), mas o comportamento não foi variado.
7. **Ambiente de produção real** (cache frio, IOPS de disco real, PgBouncer, RLS completa com policies por usuário).
8. **`sort_field=updated_at` (direção `desc`, que o hook do frontend oferece)**: a função vigente o suporta e ele cai no mesmo ramo `CASE`/`ORDER BY` dos demais — mas **não foi cronometrado** em nenhum volume.
9. **Os 5 cenários extras** (`termo_nome_2ch`, `termo_nome_3ch`, `termo_telefone`, `empresa_igual`, `cargo_igual`) **nos volumes 30k e 100k** (medidos em 3k/10k).
10. **`sort_field=company`/`updated_at` e offset 500 no volume 100k para as variantes `v1`/`v2`** (em 100k o `v1`/`v2` rodaram com offset 0 nos 7 cenários de foco).

## 8. Como reproduzir
```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$PATH"
# um volume por invocação curta (o ambiente mata job longo):
bash scripts/db-audit/w4-perf/run-lean.sh 100000 base zapp-w4-lean     # + seed
bash scripts/db-audit/w4-perf/run-lean.sh 100000 idx  zapp-w4-lean     # + indices propostos
python3 scripts/db-audit/w4-perf/17-relatorio.py 3000 10000 30000 100000   # tabelas do relatorio
```
Harness: `scripts/db-audit/w4-perf/` (`00-schema`, `04-seed`, `06-rpc-variants`, `07-bench`, `08-equivalencia`, `09-explain`, `10-plan-once`, `11/12/13-idx*`, `14-index-cost`, `15-trigger-bench`, `16-concorrencia.sh`, `18-drop-propostos`). Evidência bruta: `docs/audits/w4-performance-2026-09-29/evidence/` (+ `descartado/` com o motivo).

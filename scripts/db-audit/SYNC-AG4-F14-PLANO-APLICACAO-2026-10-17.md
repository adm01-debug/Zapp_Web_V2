# Sync AG4 — F14 local: replay do conjunto de origin/main e plano de aplicação futura

Cartão: t_24a53e64 (worker sql). Data da medição: 17/10/2026.
Escopo desta rodada: **LOCAL-ONLY**. Nenhuma migration foi criada, nenhum banco de
produção foi tocado, nenhuma migration de reconciliação foi escrita. Este documento é a
proposta de aplicação futura (Etapa 148), para decisão do Joaquim.

## 1. Fatos medidos

Origem do replay: `origin/main`. Cópia do dia: branch `v2/sync-ag4-banco-2610170855a3ad`
(base dia/2026-10-17, commit `d723a90107`).

- migrations `supabase/migrations/**.sql`: **origin/main 1046 x cópia do dia 852**.
- **195 migrations existem só em origin/main** (lista em `.tmp/origin-only.txt`, rodada local).
- **1 migration existe só na cópia do dia**: `20260927570000_talkx_e27_realtime_campaign_events.sql`.
- testes `supabase/tests/**.sql`: **origin/main 90 x cópia do dia 22**.
- diff do escopo de banco (supabase/tests + scripts/db-audit) entre a cópia e origin/main:
  **211 arquivos, 51.959 inserções, 617 remoções**.

### 1.0 Classificação das 195 migrations origin-only por área de conteúdo

Classificação pelo nome do arquivo (prefixo/objeto principal), soma 195:

| área | qtd | área | qtd |
| --- | --- | --- | --- |
| mensagens/inbox/conversas | 42 | storage/mídia/áudio | 10 |
| talkx/campanhas/segmentos | 38 | contatos | 6 |
| segurança/rls/definer/grants | 26 | busca/search | 4 |
| filas/agentes/sla/ops | 21 | email/gmail | 3 |
| auth/sessão/passkey/login | 14 | gamificação/jogos | 3 |
| dashboard/métricas/rpc-várias | 11 | crm/outbox | 1 |
| | | times/team chat | 1 |
| **resíduo não classificado por nome** (15): policies de snooze/pins/favoritos para authenticated, higiene de grants/public, realtime de canais privados, `interactive_buttons_list_rich_outbound`, `ai_replace_tags_preserva_humana`, `tc002_find_or_create_direct_pair_upsert`, `whatsapp_default_connection_rpc_atomica`, `catalogo_rate_limit_politica_confiavel`, `request_department_access_rpc` (x2), `tasks_rearm_on_remind_change`, `profiles_can_download_trigger`, `custom_emoji_use_rpc`, `comment-link-preview-cache` | 15 | | |

É a área `mensagens/inbox` somada a `talkx` que concentra o risco de aplicar em lote
(80 das 195), seguida de segurança/RLS (26).

### 1.1 Colisão de timestamp `20261016220000` (existente em origin/main)

Dois arquivos com o MESMO timestamp, nenhum dos dois na cópia do dia:

| arquivo | objeto tocado | observação |
| --- | --- | --- |
| `20261016220000_fix_domain_case_sensitivity.sql` | `public.handle_new_user_role()` (CREATE OR REPLACE FUNCTION) | 72 linhas, DDL real |
| `20261016220000_search_events_rls_decision.sql` | nenhum | 29 linhas, **só comentário** ("Nenhuma DDL é executada") |

Conclusão (nível arquivo): o par é **inofensivo** — os conjuntos de objetos são disjuntos
e o segundo arquivo não executa DDL, então a ordem de aplicação entre os dois não muda o
resultado. Não é preciso renomear nada para aplicar; o empate só importa se um dia um
terceiro arquivo com esse timestamp tocar o mesmo objeto.

### 1.2 `migration-evidence.json` — revalidado

- `schema_version` 2 nos dois lados; **62 exceções nos dois lados, conjunto de versões idêntico**.
- **62/62**: o arquivo citado existe tanto em origin/main quanto na cópia do dia e o
  `file_sha256` confere no lado correspondente. Nenhuma exceção aponta arquivo ausente.
- 153 linhas de diferença entre as duas versões do arquivo: são **valores** (hashes,
  justificativas), não a lista de migrações.
- **0** migrations origin-only são citadas no `migration-evidence.json` (nem na versão de
  HEAD, nem na de origin/main).

### 1.3 Manifesto: arquivo (origin) x arquivo (cópia do dia)

Comparando `supabase/schema-manifest.json` da cópia do dia com o de origin/main
(ambos são retrato de produção, não das migrations), as únicas diferenças são:

- `generated_at`: `2026-10-09T16:18:59Z` → `2026-10-16T18:17:30Z`;
- `routine_grants`: **740 → 738**. As duas entradas que somem são
  `multiplix_audiences_validate_shared_roles()` com `EXECUTE` para `PUBLIC` e para
  `authenticated` — exatamente o que a migration origin-only
  `20261010101613_revoke_execute_public_multiplix_trigger.sql` revoga.

Todas as outras seções (rls, columns, indexes, policies, triggers, functions, constraints,
types, views, demais grants) têm contagem **idêntica**. Ou seja: entre os dois retratos de
produção mudou 1 objeto; entre os **arquivos** mudaram 195 migrations.

### 1.4 Manifesto: banco LOCAL (pós-replay das 1046) x arquivo de origin/main

Replay: `scripts/db-audit/replay-local.sh` (E24) com o conjunto de origin/main, imagem
fixada por digest, papel `supabase_admin`.
**Resultado: 1022 ok, 24 falhas de 1046, em 110 s; classificação 20 esperadas / 4 INESPERADAS
(`REPLAY=VERMELHO`).** As 4 fora do allowlist:

| migration | erro |
| --- | --- |
| `20261011003008_talkx_n102c_window_open.sql` | cannot change return type of existing function |
| `20261012192938_team_chat_media_path_sender_conversation.sql` | column "media_path" of relation "team_chat_media_acl_r2_db_020_rb" does not exist |
| `20261013210002_realtime_canais_privados.sql` | relation "realtime.messages" does not exist |
| `20261013230007_my_active_sessions.sql` | relation "auth.sessions" does not exist |

(As duas últimas são objeto **de serviço do Supabase** que o bootstrap do replay não cria —
artefato de bancada, não defeito do repositório. As duas primeiras são de repositório.)

Manifesto do banco local (`.tmp/manifest-local.json`, gerado com o `manifest.sql` de
origin/main) contra o `schema-manifest.json` commitado em origin/main:

| leitura | chaves local | chaves origin | só local | só origin | hash diferente |
| --- | --- | --- | --- | --- | --- |
| bruta | 15085 | 11093 | 9753 | 5761 | 784 |
| normalizada (sufixo `\|grantor=` removido) | 15085 | 11093 | **4199** | **207** | **784** |

Cuidado de leitura (é o meu próprio alerta de artefato): o replay roda como
`supabase_admin` e a produção grava `grantor=postgres`, então TODA seção de GRANT difere na
leitura bruta (por isso a "normalizada"). Mesmo normalizada, o banco montado a partir dos
arquivos tem **4199** objetos/grants ausentes do retrato de produção e o retrato de produção
tem **207** ausentes dos arquivos (ex.: `resolve_talkx_outcome_unknown`,
`retry_talkx_recipients`, `talkx_benchmarks`, `talkx_resolve_audience`). Tabelas em
`public`: **200 no banco local x 180 no retrato commitado**.

## 2. Ferramenta de bancada quebrada (registro, fora da minha área)

`zapp-db-local up .` falha nesta cópia com `ERRO: contêiner do banco não encontrado` (RC=1),
depois de já ter subido a stack: o wrapper procura o contêiner pelo padrão
`supabase-<nome>-<nome>-database-`, mas o CLI criou
`supabase-sync-ag4-banco-2610170855a3a-sync-ag4-ba-database-...` (segundo segmento
truncado em 10 caracteres). Consequência: o caminho `check`/`psql` do wrapper não funciona
aqui e o manifesto do banco local teve de ser lido com o cliente `psql` direto na porta do
replay (ver seção 3). Encaminhar a quem mantém `~/.local/bin/zapp-db-local`.

## 3. Como o banco local foi obtido (reprodutível)

1. `git archive origin/main supabase/migrations | tar -x -C .tmp/origin-replay`;
2. `.tmp/replay-keep.sh` = cópia do `replay-local.sh` com `remover_nosso` neutralizado por
   `REPLAY_MANTER_CONTAINER=1` (para poder dumpar o manifesto antes de destruir o banco);
3. `bash .tmp/replay-origin-keep.sh` (roda com cwd na árvore de origin/main);
4. `PGPASSWORD=replay psql -h 127.0.0.1 -p 5499 -U supabase_admin -d postgres -X -At -f .tmp/manifest-origin.sql > .tmp/manifest-local.json`;
5. `python3 .tmp/manifest-compare2.py .tmp/manifest-local.json .tmp/manifest-origin.json`.

Nenhum artefato temporário deste documento vai para o repositório (tudo em `.tmp/`, ignorado).

## 4. Plano de aplicação futura (proposta — NÃO executar sem ordem do Joaquim)

Pré-condição escrita (obrigatória antes de qualquer passo abaixo): **canal RO para agentes
funcionando**, confirmado pelo senior. Até lá este plano fica parado.

Ordem proposta:

1. **Fechar a bancada primeiro.** Consertar `zapp-db-local` (seção 2) para que o manifesto
   do banco local seja comparável pelo caminho canônico (`check`/`manifest.sql`) e não por
   leitura manual. Sem isso, qualquer "verde" de manifesto é frágil.
2. **Aplicar as 195 migrations na cópia do dia, em trilha própria** (uma migration por
   cartão, nada em lote): o conjunto é grande e cruza muitas áreas (ver quadro do relato).
   O replay já mostra que 20 das 24 falhas são esperadas (allowlist) e que 4 precisam de
   causa raiz antes de tocar a cópia.
3. **Corrigir as 2 falhas de repositório** (`talkx_n102c_window_open`,
   `team_chat_media_path_sender_conversation`) na origem do problema — não na cópia do dia.
4. **Só então** regerar `supabase/schema-manifest.json` (arquivo versionado) e alinhar
   `supabase/tests` (90 x 22) + `scripts/db-audit`.
5. **Produção: parada.** Nenhuma migration em produção sem autorização explícita do Joaquim.

Riscos medidos que sustentam a ordem: (a) o retrato de produção e os arquivos já divergem
em 4199 objetos/grants de um lado e 207 do outro; (b) 1 objeto mudou no retrato entre
09/10 e 16/10 enquanto os arquivos ganharam 195 migrations — o retrato não está sendo
regenerado no mesmo ritmo.

## 5. Portões PENDENTE-JOAQUIM (com id de decisão)

- **D1** — aplicar as 195 migrations na cópia do dia? (bloqueia os passos 2–4)
- **D2** — regerar `supabase/schema-manifest.json` e alinhar `supabase/tests`: só o dono autoriza.
- **D3** — qualquer aplicação em produção: proibido sem ordem explícita.
- **D4** — conserto do `zapp-db-local` (fora da minha área): a quem encaminhar?

Nada aqui é prova canônica de produção. O que está medido é a diferença entre os
**arquivos** de origin/main e a **cópia do dia**, e entre os **arquivos** e o
**retrato commitado**.

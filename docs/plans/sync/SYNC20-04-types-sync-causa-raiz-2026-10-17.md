# SYNC20-04 — `types-sync` vermelho: causa-raiz e plano de regeneração do `types.ts`

Cartão: **t_0550934a**. Especialista: **Edgar (area-edge-api)**. Data: 17/10/2026.
Escopo: **LOCAL-ONLY**. Nenhum merge, push, PR, apply ou deploy. Leitura do banco canônico
somente pelo canal RO `zapp-db-ler`. Nenhuma credencial foi lida do disco, nenhum dado de
linha de usuário foi consultado (só catálogo/ledger).

Base: branch `v2/types-sync-causa-raiz-26101709440412` (base `dia/2026-10-17`, commit `d723a90107`).
Alvo do run vermelho: `main` @ `a9b4d6c6fb35`.

---

## 0. Veredito em uma linha

O `types-sync` fica vermelho porque o **Gate 1 (TypeScript não piora)** compara `tsc -b --force`
com um baseline **vazio** (`scripts/ci/typecheck-baseline.json` = `"issues": []`), enquanto o
**próprio `main` já carrega 98 erros de tipo** com o `types.ts` que está commitado nele. O drift
de types/catálogo/manifesto/grants é **real e bidirecional**, mas **não é a causa do Gate 1
vermelho**: medido, ele acrescenta **0 erro** em relação ao que `main` já tem.

A regeneração do `types.ts` é, portanto, o **segundo** problema. O primeiro é a dívida de tipos
que entrou no `main`.

---

## 1. Evidência-mãe (o run vermelho)

- Run: `38986918662`, workflow `types-sync.yml`, branch `main`, sha `a9b4d6c6fb35`, evento `push`,
  conclusão `failure`.
- Falha final do job:
  `::error::A sincronizacao foi bloqueada por um ou mais gates.`
- Gate 1, linha crua do log:
  `Typecheck ratchet: baseline=0, atual=97, removidas=0, novas=97`
  `FALHA: novos erros de tipo detectados:`
  `Corrija os novos erros. Atualize o baseline somente quando a nova divida tiver aprovacao explicita.`
- A mensagem do workflow
  (`::warning::Gate 1 falhou: novos erros de TypeScript introduzidos pelo novo types.ts.`) é
  **enganosa**: os erros não foram introduzidos pelo novo `types.ts` (ver §2, Fato A).

Reprodução do log: `gh run view 38986918662 --log-failed`.

---

## 2. Causa-raiz — três fatos medidos

### Fato A — o baseline do ratchet é vazio e o `main` **não** é limpo (causa direta)

- `scripts/ci/typecheck-baseline.json` em `origin/main`:
  `{"schemaVersion": 2, "command": "tsc -b --force", "issues": []}` → **0 issues**.
- `scripts/ci/typecheck-ratchet.mjs` roda `tsc -b --force` e compara com esse baseline; toda
  diferença vira "novo erro".
- Medição local: extraí a árvore de `origin/main` (`git archive origin/main | tar -x -C .tmp/main-tree`,
  `node_modules` do workspace por symlink) e rodei o ratchet:
  - com o `types.ts` **commitado do main** → `baseline=0, atual=98, removidas=0, novas=98` → **FALHA**;
  - com o `types.ts` **candidato do run** → `baseline=0, atual=98, removidas=0, novas=98` → **FALHA**;
  - `diff` dos dois conjuntos de erro (top-50, que é o corte do ratchet) = **vazio**.

**Conclusão:** com o `main` como está, o Gate 1 do `types-sync` falha **antes e
independentemente do drift**. O run do CI contou 97 e a minha reprodução 98 (diferença de 1,
provavelmente de ambiente); o conjunto reportado é o mesmo.

Perfil dos 98 erros (`origin/main` + types commitado) — todos de **app**, nenhum de schema:

| código | qtd (top-50) | exemplo |
| --- | --- | --- |
| TS2322 | 22 | `ChatMessagesArea.tsx(452,17)` prop `onInteractiveListItemClick` inexistente |
| TS2339 | 13 | `useTeamChatPanel...test` `isSearchingMessages` inexistente no retorno do hook |
| TS2353 | 7 | `evolutionAdapter.ts(189,5)` `presence_status` fora de `ContactRow` |
| TS2345 | 5 | `"transfer_conversation"` fora do union de RPCs |
| TS2739 | 1 | `SettingsView.tsx(232,12)` faltam `isSaving`/`onSave` |
| TS2304 | 1 | `ConnectionCard.tsx(147,48)` `handleDisconnectDialogOpenChange` não definido |
| TS17001 | 1 | `QueueAlertsDisplay.tsx(94,19)` atributo JSX duplicado |

Origem presumida: a integração do **lote 880** em `main`
(`9c0a82cf42`/`9c4ee43f1c`, 16/10). Não é o escopo desta investigação provar isso item a item.

### Fato B — a árvore do dia é limpa; o drift só "custa" com ela

- Na base `dia/2026-10-17` (`types.ts` = **12.749 linhas / 391.111 B**):
  `node scripts/ci/typecheck-ratchet.mjs` → `baseline=0, atual=0, removidas=0, novas=0` → **OK**.
- Aplicando o `types.ts` **candidato do run** sobre essa árvore limpa →
  `baseline=0, atual=5, removidas=0, novas=5` → **FALHA com 5 erros**:

| arquivo | erro | causa, em uma linha |
| --- | --- | --- |
| `src/adapters/evolutionAdapter.ts(31,3)` | TS2322 | `messages.transcribed_at` passou a ser exigido pelo tipo gerado |
| `src/components/inbox/ChatPanel.tsx(365,42)` | TS2345 | RPC `transfer_conversation` ausente do union gerado |
| `src/components/inbox/RealtimeCollaboration.tsx(41,72)` | TS2345 | idem |
| `src/hooks/chat/useConversationActions.ts(273,42)` | TS2345 | idem |
| `src/hooks/inbox/useInboxBulkActions.ts(117,46)` | TS2345 | idem |

Ou seja: **depois** de zerada a dívida do `main`, ainda restam 5 erros causados pelo drift
propriamente dito (4 do mesmo RPC + 1 da coluna nova). É esse o resíduo que a regeneração
precisa tratar.

### Fato C — o drift é real e bidirecional (conferido pelo canal RO)

Comparação **candidato gerado no run** (`types-sync-candidates-38986918662-1`, contra o canônico
de 17/10 00:34) × **artefatos commitados em `origin/main`** (retrato de 16/10 18:17).

Contagens:

| conjunto | main (commitado) | candidato (canônico) | delta |
| --- | --- | --- | --- |
| `types.ts` (linhas) | 13.035 | 13.048 | +13 |
| `types.ts` (bytes) | 399.225 | 399.373 | +148 |
| catálogo: tables | 169 | 171 | +3 / −1 |
| catálogo: columns | 1.977 | 1.990 | +20 / −7 |
| catálogo: functions | 266 | 279 | +14 / −1 |
| catálogo: check_constraints | 159 | 168 | +10 / −1 |
| catálogo: trigger_functions | 67 | 72 | +5 / 0 |
| manifesto: rls | 168 | 171 | +3 |
| manifesto: policies | 448 | 456 | +8 |
| manifesto: triggers | 123 | 129 | +6 |
| manifesto: functions | 332 | 352 | +20 |
| manifesto: constraints | 652 | 668 | +16 |
| manifesto: indexes | 629 | 637 | +8 |
| manifesto: defaults | 896 | 907 | +11 |
| manifesto: routine_grants | 738 | 788 | +50 |
| manifesto: relation_grants | 4.962 | 5.013 | +51 |
| grants: authenticated_execute_count | 134 | 151 | +17 |
| grants: service_role_execute_count | 252 | 284 | +32 |

Objetos **adicionados** (canônico tem, artefato commitado não):

- tabelas: `app_settings`, `connection_alert_preferences`, `search_events`
- colunas: `messages.transcribed_at`, `whisper_messages.audio_path`, `app_settings.{key,updated_at,value}`,
  `connection_alert_preferences.{id,user_id,alert_on_degraded,alert_on_disconnected,email_enabled,push_enabled,created_at,updated_at}`,
  `search_events.{id,user_id,term_length,had_results,result_kind,clicked,created_at}`
- funções (14): `admin_unlock_login`, `crm_sync_outbox_cron_enabled`, `delivery_stats`,
  `get_team_birthdays`, `inbox_wait_summary`, `my_network_status`, `purge_gmail_account_data`,
  `purge_old_search_events`, `purge_voice_command_logs`, `rpc_queue_goal_metrics`,
  `run_crm_sync_outbox_cleanup`, `search_insights`, `talk_me_list_pending_messages`,
  `trigger_crm_sync_outbox`
- trigger functions (5): `enforce_contacts_consent_status_guard`, `enforce_scheduled_message_state`,
  `stamp_message_transcribed_at`, `whisper_messages_somente_is_read`, `whisper_messages_valida_audio_path`
- check constraints (10), entre elas `search_events.search_events_term_length_range` e
  `whisper_messages.whisper_messages_audio_path_formato`

Objetos **removidos** (artefato commitado tem, canônico **não**) — é o que o Gate 3 vai barrar:

- tabela `talkx_segment_fields` (−7 colunas)
- função `talkx_compile_segment_rules(p_rules jsonb, p_depth integer) -> text`
- grants: `record_incoming_call_event(...)`, `record_talkx_campaign_lifecycle_event()`,
  `passkey_credentials`, views `whatsapp_connections{,_agent,_public,_safe}`

**Conferência no canônico pelo canal RO** (`zapp-db-ler`, 17/10) — não usei o manifesto commitado
como fonte de verdade:

```
tabelas(public)=171  colunas=1990  funcoes=353
app_settings=1  talkx_segment_fields=0  messages.transcribed_at=1
transfer_conversation=0  talkx_compile_segment_rules=0
ledger supabase_migrations.schema_migrations = 912 versões (min 20251215024517, max 20261016230000)
```

Isso **corrobora o AG4b F12** (policies 448→456, triggers 123→129, functions 332→353, tabelas
com RLS 168→171) e confirma que os dois sentidos do drift são reais: o canônico está **à frente**
em `app_settings`/`search_events`/`transcribed_at` etc. e **atrás** em `talkx_segment_fields`/
`talkx_compile_segment_rules`/`transfer_conversation` (objetos que só existem nos **arquivos** do
repositório, i.e. migrations não aplicadas nesse banco).

---

## 3. Plano de regeneração do `types.ts` (proposta — **não executar sem ordem**)

### Passo 0 — destravar o Gate 1 (pré-condição de tudo)

Sem isso, **nenhuma** regeneração sai: o Gate 1 falha por causa da dívida do `main`.

- **Caminho recomendado** (mantém o portão forte): zerar os 98 erros de tipo do `main` em cartões
  por arquivo (é a dívida do lote 880). Enquanto isso, `types-sync` fica vermelho **de propósito**.
- **Caminho NÃO recomendado** (enfraquece o portão; só com ordem explícita do Joaquim):
  `node scripts/ci/typecheck-ratchet.mjs --update-baseline` gravaria os 98 no baseline — o portão
  deixa de pegar regressão.

### Passo 1 — regenerar contra o canônico pelo canal endurecido

Nunca com credencial local: o `types-sync.yml` já usa `secrets.DESTINO_URL` + `PGSSLMODE=verify-full`
+ CLI pinada (`SUPABASE_CLI_VERSION: 2.116.0`). Rode pelo próprio workflow:

```
gh workflow run types-sync.yml            # gera candidatos e, na branch do dia, abre PR
gh run view <run-id> --log-failed         # conferir gates sem abrir nada
gh run download <run-id> -n types-sync-candidates-<run>-1 -D .tmp/candidates
```

### Passo 2 — aplicar o drift em **duas metades**, nunca juntas

- **2a) Aditivo** (canônico tem, arquivos não): aceitar as adições de §2-C e ajustar os call-sites.
  Aqui caem os 5 erros do Fato B: `transcribed_at` (1) e `transfer_conversation` (4 — decidir se o
  RPC passa a ser aplicado no canônico ou se o app deixa de chamá-lo).
- **2b) Destrutivo** (arquivos têm, canônico não): `talkx_segment_fields`, `talkx_compile_segment_rules`,
  `record_incoming_call_event`, `record_talkx_campaign_lifecycle_event`, `passkey_credentials`,
  views `whatsapp_connections*`. **O caminho certo não é apagar do `types.ts`** — é **aplicar as
  migrations pendentes no canônico** (D1 do F14). Sem isso, o Gate 3 (`check-remocoes-destrutivas`)
  barra a regeneração.

### Passo 3 — regerar os artefatos irmãos **na ordem** (nunca só o `types.ts`)

`migrations → canônico → manifesto/catálogo/grants → types.ts`, e depois:

```
node scripts/ci/db-inventory-doc.unit.mjs           # doc de inventário tem de bater
node scripts/db-audit/check-remocoes-destrutivas.mjs
bash scripts/db-audit/gen-types.test.sh
```

### Passo 4 — portões humanos (do F14, continuam valendo)

- **D1** — aplicar as 195 migrations origin-only na cópia do dia.
- **D2** — regerar `supabase/schema-manifest.json` + alinhar `supabase/tests` — só o dono autoriza.
- **D3** — **qualquer aplicação em produção é proibida** sem ordem explícita do Joaquim.

---

## 4. Diff esperado do PR de sync (o que vai mudar, nominal)

- `src/integrations/supabase/types.ts`: **+13 linhas** (13.035 → 13.048) =
  - bloco novo da tabela `app_settings` (Row/Insert/Update/Relationships, 18 linhas, entra ~linha 617);
  - **ruído de versão do CLI 2.116.0**: os helpers gerados perdem parênteses
    (`TableName extends (X extends {...} ? ... : never) = never` → `... extends X extends {...} ? ... : never = never`)
    em 5 pontos (`Tables`/`TablesInsert`/`TablesUpdate`/`Enums`/`CompositeTypes`);
  - **remoção** do bloco `__InternalSupabase` (`PostgrestVersion: "14.17"`), 5 linhas.
  - As 14 funções novas **não** aparecem no diff do `types.ts` porque **o `types.ts` commitado no
    `main` já as contém** (`search_insights`, `purge_old_search_events`, `get_team_birthdays`,
    `inbox_wait_summary` = 1 ocorrência cada nos dois lados). Isso prova que os artefatos do `main`
    foram gerados em **momentos diferentes**: o `types.ts` está à frente do `catalog.json`/`manifest.json`
    (16/10 18:17). É o mesmo problema de paridade, agora **dentro do próprio commit**.
  - `transfer_conversation` e `talkx_compile_segment_rules` estão ausentes nos **dois** lados
    (`types.ts` de main e candidato) — reforça que o erro de `transfer_conversation` é pré-existente
    no `main`.
- `supabase/schema-catalog.json`: +3 tabelas / −1, +20 / −7 colunas, +14 / −1 funções,
  +10 / −1 check_constraints, +5 trigger_functions (nomes em §2-C).
- `supabase/schema-manifest.json`: rls +3, policies +8, triggers +6, functions +20, constraints +16,
  indexes +8, defaults +11, routine_grants +50, relation_grants +51.
- `scripts/db-audit/grants-baseline.json`: `authenticated_execute_count` 134→151,
  `service_role_execute_count` 252→284, e as remoções de grants listadas em §2-C.

---

## 5. O que NÃO fazer

1. Não atualizar `typecheck-baseline.json` para "passar" o Gate 1 (esconde a dívida; só com ordem do Joaquim). 
2. Nenhuma migration/aplicação em produção (D3).
3. Não mergear os PRs de sync em bloco: o AG5 mediu `1983` (3.115 arq / +362.236) e `1987` (114 arq / −64.397),
   ambos acima do teto da etapa 173 (≤30 arq / ≤1.500 linhas) — precisam ser fatiados.
4. Não usar o manifesto/catálogo **commitado** como fonte de verdade do canônico (AG4b): ele está atrás em 4 conjuntos.

---

## 6. Comandos usados (reprodutíveis, tudo local)

```bash
# run vermelho
gh run view 38986918662 --json headBranch,headSha,event,conclusion
gh run view 38986918662 --log-failed > .tmp/run-types-sync.log
gh run download 38986918662 -n types-sync-candidates-38986918662-1 -D .tmp/candidates

# o Fato A: main com o types commitado vs o candidato
mkdir -p .tmp/main-tree && git archive origin/main | tar -x -C .tmp/main-tree
ln -s "$PWD/node_modules" .tmp/main-tree/node_modules
(cd .tmp/main-tree && node scripts/ci/typecheck-ratchet.mjs)         # atual=98 -> FALHA
cp .tmp/candidates/src/integrations/supabase/types.ts .tmp/main-tree/src/integrations/supabase/types.ts
(cd .tmp/main-tree && node scripts/ci/typecheck-ratchet.mjs)         # atual=98 -> FALHA (mesmos erros)

# o Fato B: árvore do dia, limpa, com o candidato
node scripts/ci/typecheck-ratchet.mjs                                 # atual=0 -> OK
cp .tmp/candidates/src/integrations/supabase/types.ts src/integrations/supabase/types.ts
node scripts/ci/typecheck-ratchet.mjs                                 # atual=5 -> FALHA
git checkout -- src/integrations/supabase/types.ts

# o Fato C: canal RO (somente leitura)
zapp-db-ler "select count(*) from supabase_migrations.schema_migrations;"
zapp-db-ler "select <tabelas/colunas/funcoes/presenca de objetos>;"
```

## 7. Limites desta medição

- O número "**~64k**" citado no cartão (junto de "AG4 types 12.749") **não corresponde a nenhum
  artefato que eu consegui medir** — nenhum arquivo de types/manifesto/catálogo/grants tem essa
  ordem de grandeza nesta árvore. O "12.749" **bate** com as linhas do `types.ts` da base do dia.
  Todos os números deste documento foram **medidos agora**, nenhum copiado de relato anterior.
- O `tsc` local roda com o `node_modules` deste workspace; a contagem do CI foi 97 e a minha 98
  (diferença de 1, provavelmente ambiente). O conjunto reportado (corte de 50) é idêntico entre
  commitado e candidato, que é o que sustenta o Fato A.
- Não há prova canônica de produção neste documento: a leitura do canônico foi por catálogo/ledger
  via canal RO, sem conteúdo de linhas de usuário.

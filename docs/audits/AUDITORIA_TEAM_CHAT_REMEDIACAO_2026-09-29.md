# Auditoria — Team Chat: plano de remediação (28/09) × branch `claude/confident-babbage-ivgmmn` × banco — 2026-09-29

**Objeto:** `docs/audits/PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` (100 etapas) e a PR
[adm01-debug/Zapp_Web_V2#1151](https://github.com/adm01-debug/Zapp_Web_V2/pull/1151) (draft, 5 commits,
`be48c1d`, 55 arquivos: 44 migrations + 11 arquivos em `src/hooks/team-chat/`), cuja descrição afirma
"Implementação completa do plano".
**Base auditada:** branch `claude/confident-babbage-ivgmmn` @ `be48c1d` (4 commits atrás de `main` @ `a0002bb`)
+ banco de produção `tnnnlkbymytvtqngbbqh` ao vivo (PG 17.6) em 29/09.
**Método:** leitura integral das 44 migrations e dos 11 hooks (3 auditorias paralelas por bloco), consultas ao
vivo (`pg_policies`, `pg_constraint`, `pg_indexes`, `pg_proc`, `role_table_grants`, `column_privileges`,
`pg_publication_tables`, ledger), `tsc -b --force`, `eslint`, `vitest`, `supabase-usage-guard.mjs` e o log da CI
da PR (run 36490368146).

## 1. Resultado

| Veredito | Etapas | Observação |
|---|---|---|
| **DONE** | **1** | E52 (arquivo `20260928650000` correto) — **mas não aplicado no banco** |
| **PARCIAL** | **24** | existe algo no branch/`main`, incompleto ou com defeito |
| **DIVERGENTE** | **21** | implementou coisa diferente do plano, ou quebraria o módulo se aplicado |
| **AUSENTE** | **54** | nada feito |

**Nada do plano está em produção.** Ledger: `max(version) = 20260928210000`; nenhuma das 44 versions
`20260928220000…650000` está registrada; `team_*` continuam com `TRUNCATE`/`TRIGGER`/`REFERENCES` para
`anon`+`authenticated` (54 grants), `anon` tem 62 grants no escopo, `department_invites` existe com as 3 policies
`USING (true)`, `team_messages` UPDATE cobre as 14 colunas, `departments.whatsapp_api_key` continua gravável,
6 policies `roles={public}`, `REPLICA IDENTITY FULL`, `team_message_receipts` sem `conversation_id`, nenhuma RPC
nova (`get_team_conversations`, `get_team_messages`, `send_team_message`, `mark_team_messages_read`,
`toggle_team_message_reaction`, `create_team_conversation`, `leave_team_conversation`,
`remove_team_conversation_member` **não existem**). Não aplicar antes do merge é a regra 6 da seção 1 do
CLAUDE.md — o problema não é o "não aplicado", é o resumo da sessão anterior ter dito o contrário.

**A PR #1151, se mergeada e aplicada como está, derruba o Team Chat em produção.** Não é um plano executado
pela metade: é um conjunto de DDL escrito contra um schema que não é o deste banco.

### 1.1 Defeitos bloqueantes (confirmados ao vivo em 29/09)

| # | Defeito | Prova | Efeito se aplicado |
|---|---|---|---|
| B1 | **`auth.uid()` usado como `profiles.id`** em todas as RPCs (510000–630000) e policies novas (250000, 330000–360000) | `SELECT count(*) FILTER (WHERE id = user_id) FROM profiles` → **0 de 6**. As policies de `main` usam `(SELECT id FROM profiles WHERE user_id = auth.uid())` ou `is_team_conversation_member(auth.uid(), …)` | inbox vazio, `not_member` em enviar/ler/reagir/sair, ninguém edita mensagem, storage negado |
| B2 | **`profiles.is_admin` não existe** (colunas reais: `role`, `access_level`, `permissions`…; existe `is_admin_or_supervisor(auth.uid())`) | `information_schema.columns` ao vivo | `CREATE POLICY` de E15/E19/E20/E21 falha no apply (42703); RPCs E14/E16/E17/E43/E45/E47 compilam e falham em toda chamada |
| B3 | **`department_audit_logs.actor_id` não existe** (coluna real: `profile_id`) | ao vivo | auditoria de convite/WhatsApp/aceite falha em runtime |
| B4 | **Modelo de papéis errado**: trigger `620000` aceita `('member','moderator','admin')`; CHECK vigente é `('owner','admin','member')`; RPCs tratam `'admin'` como dono | `team_conversation_members_member_role_check` ao vivo | `find_or_create_direct_conversation` (insere `'owner'`) passa a falhar; `'moderator'` viola o CHECK |
| B5 | **`send_team_message` insere `content = NULL` para mídia**; `team_messages.content` é NOT NULL | `530000:35,54` | 23502 em todo envio de anexo/áudio/imagem |
| B6 | **4 migrations falham no apply**: `270000` (índice parcial com `now()` no predicado), `320000` (`CREATE OR REPLACE` mudando tipo de retorno → 42P13), `330000` (usa `storage.policies`, tabela inexistente), e todo `CREATE POLICY` com `is_admin` | leitura | bloco A não aplica inteiro numa transação |
| B7 | **`DROP POLICY IF EXISTS` com nomes inventados** (`300000`, `340000`, `350000`): as policies reais ("Creator can update conversation", "Members can leave or admins can remove", "Members and admins can add conversation members", `dept_audit_insert_authenticated`) **ficam**; como policies são OR, as restrições novas são anuladas | manifest × migrations | falsa sensação de hardening — pior que não fazer |
| B8 | **Front chama 8 RPCs que não existem em `types.ts` nem no banco** | `tsc -b --force` → **13 erros** no módulo (`useTeamConversations.ts:82`, `useTeamMessages.ts:56,62`, `useTeamChatMutations.ts:39,119,175,180,196`, `useMarkConversationRead.ts:10`, `useTeamMessageReactions.ts:93`, `useTeamReadState.ts:14`, `TeamChatPanel.tsx:141`, `NewConversationDialog.tsx:91`) | build quebrado |
| B9 | **Contrato RPC × hook incompatível**: `get_team_conversations` devolve `id` + `last_message` jsonb, sem `members[]`; o hook lê `row.conversation_id` e `row.members.find(...)` | `useTeamConversations.ts:11,20,31` | `TypeError: Cannot read properties of undefined (reading 'find')` na lista |
| B10 | **`get_team_messages` não devolve `sender`**; UI usa `msg.sender?.name/avatar_url` | `520000` × `TeamChatPanel.tsx:180-210` | todo remetente vira "?" |
| B11 | **CI vermelha**: `🔍 Lint & TypeCheck` falha no ratchet de ESLint (2 erros `react-hooks/set-state-in-effect` em `useResolvedStorageUrl.ts:12` e `useTeamDraft.ts:19`, 3 diretivas `eslint-disable` inúteis); o ratchet de TypeScript e o `supabase-usage-guard` nem chegam a rodar; SonarCloud Quality Gate falhou (Reliability C) | run 36490368146 | PR não mergeável |
| B12 | **E15 dropa `department_invites` sem contrapartida no front**: `useDepartmentManagement.ts:86,122,144` continua lendo/gravando nela; o overload antigo `accept_department_invite(p_code)` (sobre `department_invites%ROWTYPE`) permanece e quebra | ao vivo + branch | tela de convites morre |

### 1.2 O que o branch tem de aproveitável

- `20260928650000` (E52, `conversation_id` desnormalizado em `team_message_receipts`) — correto, reaproveitar.
- `queryKeys.ts` (fábrica), estrutura de `useTeamMessages` com `useInfiniteQuery`, sufixo de canal por instância,
  `toast` via `sonner`, `useMarkConversationRead`, `uploadTeamMedia` (esqueleto) — reaproveitar **depois** de
  corrigir contrato, pasta de upload e lint.
- Os cabeçalhos das migrations (objetivo em 1 linha) — mas nenhuma tem "estado ao vivo antes + rollback"
  (regra 3 do plano; `grep -l "rollback"` = 0 arquivos).

Tudo o mais (42 migrations) precisa ser **reescrito** contra o schema real, não corrigido linha a linha.

### 1.3 Achados novos (não estavam em nenhum plano)

1. `230000:14` faz `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon` — fora do escopo congelado (E01), afeta
   todos os módulos.
2. `420000` recria 4 índices duplicados, 2 deles já removidos por auditorias anteriores (`20260902220000`,
   `20260927270013`); `480000` cria GIN `to_tsvector('portuguese')` sem consumidor (o trgm já existe);
   `450000` cria `idx_team_conversations_direct_unique` duplicando `idx_team_conversations_direct_pair` e uma função
   `team_conversation_direct_members_normalized` que ninguém usa.
3. `440000` regride a FK `team_conversations.department_id` de `CASCADE` (que `20260902120000` já tinha) para
   `SET NULL`.
4. `600000` **recria** `get_team_unread_counts()` trocando o lookup de perfil por `auth.uid()` — a RPC que hoje
   funciona em `main` passaria a devolver vazio.
5. `640000` é `SELECT 1` com comentário "rodar ANALYZE manualmente" — registrar isso no ledger viola a regra 7.
6. `useTeamDraft.ts` (novo, órfão, com erro de lint) duplica `src/hooks/chat/useTeamChatDraft.ts`, que continua em uso.
7. `useTeamReadState.ts` consulta `team_message_receipts.conversation_id` que só existe após E52 — e ninguém o importa.
8. `useTeamConversations.ts:103` assina `team_message_receipts` **sem filtro** — exatamente o que E52 queria eliminar.
9. `uploadTeamMedia` grava em `${uuid}.${ext}` na raiz do bucket — a policy INSERT exige `foldername[1] = auth.uid()`
   → 403. O bug bloqueador nº 1 da auditoria de 28/09 continua nos 3 pontos originais (`TeamFileUploader.tsx:76`,
   `useTeamChatDraft.ts:76` com `getPublicUrl`; `useTeamChatPanel.ts:247`).
10. Numeração dos cabeçalhos (`-- E23`…`-- E52`) não corresponde ao plano: os arquivos seguem um plano próprio
    (ex.: arquivo "E37" cria `get_team_conversations`; plano E37 é `get_team_inbox`).
11. `README.md` dos hooks cita `nanoid(8)`, `get_team_inbox` e `get_team_messages_page` — nada disso existe no código.
12. `teamChatTypes.ts` tipa `member_role` como `'admin'|'member'|'viewer'`; o CHECK real é `owner|admin|member`.

## 2. Por etapa

Legenda: ✅ DONE · ◐ PARCIAL · ✗ AUSENTE · ⚠ DIVERGENTE. `A:` = aplicado ao vivo? (todas as etapas DDL: **não**).

### Fase 0 — Governança (E01–E06) — 0 ✅ · 0 ◐ · 0 ⚠ · 6 ✗
Nenhuma decisão registrada; "Mapa de PRs" continua com `—`; sem snapshot (`docs/audits/team-chat-baseline-2026-09-28/`
não existe). O branch respeitou o escopo de caminhos (só `supabase/migrations` e `src/hooks/team-chat`), exceto o
`REVOKE … ALL SEQUENCES` (achado 1.3.1).

### Fase 1 — Segurança (E07–E22) — 0 ✅ · 5 ◐ · 9 ⚠ · 2 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E07 revoke TRUNCATE/TRIGGER/REFERENCES | ◐ | `220000`: 8 tabelas, falta `department_invites` |
| E08 revoke ALL de anon | ◐ | `230000`: 8 tabelas + `ALL SEQUENCES` fora de escopo |
| E09 UPDATE por coluna | ⚠ | `240000:8` concede 4 colunas (inclui `status`); plano: 3 |
| E10 policy edit WITH CHECK | ⚠ | `250000`: `sender_id = auth.uid()` (B1); `conversation_id = conversation_id` tautologia |
| E11 receipts monotonicidade | ◐ | REVOKE DELETE ok; trigger não força `read_at`; sem `WITH CHECK`; cita status `'sent'` inexistente |
| E12 invitations colunas | ⚠ | `used_by → auth.users` (plano: `profiles`); sem CHECK de código/expiração; índice com `now()` **falha** (B6) |
| E13 accept_department_invite | ⚠ | overload novo `(p_code, p_department_id)`; não faz `UPDATE profiles SET department_id`; `actor_id` (B3); status `'used'` |
| E14 create_department_invite | ⚠ | `created_by = auth.uid()` — o bug que o plano manda corrigir; `is_admin` (B2); `p_email NULL` viola NOT NULL |
| E15 drop department_invites | ◐ | DROP ok; `DROP POLICY` com nomes inventados (B7); nova SELECT com `is_admin`; front não migrado (B12); catálogo/types intocados |
| E16 whatsapp colunas + RPC | ⚠ | só REVOKE UPDATE (falta INSERT e o REVOKE de tabela); modos `shared/dedicated/disabled` ≠ `none/evolution/official` real |
| E17 credentials sem chave | ⚠ | muda tipo de retorno sem DROP (42P13, B6); devolve jsonb, não `(mode, instance_id, has_api_key)`; sem RPC service_role |
| E18 storage policy | ✗ | `330000` usa `storage.policies` (B6); não remove a inerte; cria UPDATE |
| E19 UPDATE conversations | ⚠ | policy real fica (B7); `type = type` tautologia; `is_admin` |
| E20 último owner | ⚠ | policies reais ficam (B7); "Authenticated can join conversations" abre entrada em qualquer conversa; guard por RAISE sobre `'admin'` |
| E21 roles public → authenticated | ◐ | os 6 nomes batem; mas `is_admin` + `auth.uid()` (B1/B2) |
| E22 fechamento | ✗ | sem snapshot, diff, guard, types-sync |

### Fase 2 — Integridade (E23–E36) — 0 ✅ · 3 ◐ · 2 ⚠ · 9 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E23 CHECK media_type/content | ✗ | `380000` só amplia `message_type_check` (`sticker`,`reaction`) e afrouxa `status_check` |
| E24 coerência de mídia | ✗ | — |
| E25 reply mesma conversa | ✗ | `370000` só recria FK `SET NULL` (já existia) |
| E26 trigger edição/48h | ⚠ | `430000` só `updated_at`; sem `is_edited`, sem 48h |
| E27 CHECK type/direct | ◐ | `470000` cobre só NOT NULL de `direct_member_*`; amplia `type_check` com `announcement` |
| E28 unique depto + CASCADE | ⚠ | sem unique; FK regride para `SET NULL` (1.3.3) |
| E29 members CHECK + parcial | ◐ | parcial criado com colunas extras; não dropa o antigo; `420000` duplica |
| E30 reactions trigger/policy | ✗ | `390000` recria UNIQUE existente; `420000` recria índice já removido |
| E31 receipts CHECKs | ✗ | `410000` recria FK/UNIQUE existentes |
| E32 audit_logs CHECK/trigger | ✗ | nenhuma migration toca `department_audit_logs` neste bloco |
| E33 espelho metadata | ◐ | CHECK ok; sem `ADD COLUMN IF NOT EXISTS` |
| E34 espelho publication | ✗ | — |
| E35 COMMENT ON | ✗ | zero `COMMENT ON` em 44 arquivos |
| E36 fechamento | ✗ | — |

### Fase 3 — RPCs/perf (E37–E50) — 0 ✅ · 2 ◐ · 5 ⚠ · 7 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E37 get_team_inbox | ⚠ | `510000` `get_team_conversations`: sem `members[]`, sem outro perfil, `LIMIT/OFFSET`, sem `is_pinned DESC`, B1, B9 |
| E38 índice keyset | ⚠ | `420000` duplica `idx_team_messages_conversation`; sem `id DESC`; não dropa |
| E39 get_team_messages_page | ⚠ | `520000`: cursor só por `created_at` (pula empates), SECDEF, sem `sender` (B10), `reactions` descartadas pelo hook |
| E40 mark read set-based | ◐ | `540000`: UPDATE+INSERT ok; sem `created_at > last_read_at`; B1 |
| E41 view read_state | ✗ | — |
| E42 search_team_messages | ✗ | `480000` cria GIN tsvector sem consumidor |
| E43 toggle atômico | ◐ | `630000`: SELECT+DELETE/INSERT (não `RETURNING`), SECDEF, B1 |
| E44 set_team_member_pref | ✗ | front continua `update({is_muted})` direto |
| E45 transfer departamento | ✗ | `570000` é rename/avatar; `useTransferConversation` continua `created_by` |
| E46 leave/remove c/ promoção | ⚠ | `580000/590000` tratam `'admin'` como dono (B4); sem auto-promoção; `'moderator'` viola CHECK |
| E47 REPLICA IDENTITY | ✗ | segue `f` ao vivo |
| E48 pg_stat_statements | ✗ | `640000` = `SELECT 1` |
| E49 drop RPCs antigas | ⚠ | nada dropa; `600000` recria `get_team_unread_counts` quebrada (1.3.4) |
| E50 fechamento | ✗ | — |

### Fase 4 — Realtime (E51–E55) — 1 ✅ · 1 ◐ · 1 ⚠ · 2 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E51 decisão publication | ✗ | não registrada (estado ao vivo já é o desejado: 4 tabelas) |
| E52 receipts.conversation_id | ✅ | `650000` correto (trigger só preenche quando NULL — aceitável); **não aplicado** |
| E53 baselines | ◐ | publication não muda (no-op), mas `schema-catalog.json` intocado após 44 DDL |
| E54 README canais | ⚠ | cita `nanoid`, `get_team_inbox`, `get_team_messages_page`; canais reais divergem (`team:convs:<rand>`, receipts sem filtro) |
| E55 fechamento | ✗ | — |

### Fase 5 — Hooks (E56–E66) — 0 ✅ · 7 ◐ · 4 ⚠ · 0 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E56 queryKeys | ◐ | fábrica em `hooks/team-chat/queryKeys.ts` (8 chaves); faltam `search/performance/participantStats/departments.*`; literais restantes em `useTeamMemberDetails.ts:41,58`, `useTeamChatMembers.ts:33-34`, `useTeamPerformance.ts` |
| E57 inbox 1 chamada | ⚠ | 1 `rpc()` ✔, mas shape incompatível (B9), sem fixadas no topo, RPC devolve vazio (B1) |
| E58 useInfiniteQuery | ◐ | estrutura ✔, canal com sufixo ✔; cursor só `id`; realtime `event:'*'`+invalidate; `useTeamChatPanel.ts:39-42,136-165` mantém `olderMessages`/`fetchOlderMessages` antigos contra `.from('team_messages')` |
| E59 mark-as-read | ◐ | `useMarkConversationRead` existe, **ninguém chama**; efeito antigo removido de `useTeamMessages` → no branch **nada** marca como lida (regressão) |
| E60 uploads | ⚠ | `uploadTeamMedia(file)` sem pasta `<uid>/<cid>/` (403), sem `conversationId`, sem consumidor; 3 pontos originais intactos com `getPublicUrl` |
| E61 mídia resolvida | ◐ | `useResolvedStorageUrl` movido para `team-chat/`; sem cache React Query; erro `set-state-in-effect` (B11) |
| E62 mutations | ◐ | `sonner` ✔ (`use-toast` zerado), send/leave/remove por RPC ✔; `useToggleMuteConversation` direto e com assinatura nova (TS em `TeamChatPanel.tsx:141`); sem `useSetMemberPref`/`useTransferDepartment`/`useUpdateTeamMessageStatus`; edit ainda manda `is_edited`/`updated_at` |
| E63 reações agregadas | ◐ | ainda query separada `.from('team_message_reactions')`; realtime filtrado ✔ |
| E64 useTeamReadState | ⚠ | lê coluna inexistente (TS), sem view, sem realtime, órfão |
| E65 tipos | ◐ | `TeamConversationInbox`/`TeamMessagePage` adicionados; `member_role` errado (1.3.12); `types.ts` não regenerado (B8) |
| E66 rascunhos | ⚠ | `useTeamDraft` novo, órfão, com lint error, duplica `useTeamChatDraft` em uso; sem teste |

### Fase 6 — Componentes (E67–E78) — 0 ✅ · 3 ◐ · 0 ⚠ · 9 ✗
Branch não toca `src/components/team-chat/`. Estado = `main` (idêntico ao da auditoria de 28/09): `TeamChatPanel.tsx`
273 linhas com helpers duplicados (`:24-64`) e reply 2× (`:194-217`); `TeamMessageItem`,
`TeamMessageReactionsWrapper`, `TransferConversationDialog`, `GroupManagementDialog`, `TeamPerformancePanel`,
`ParticipantStatsGraph`, `TeamChatA11y` órfãos (0 importadores); 16 ocorrências de `bg-black|bg-card|bg-background`;
`team-chat-tokens.css` nunca carregado; Fixar/Arquivar `disabled` (`TeamChatHeader.tsx:266-273`), Performance "em
breve" (`:150-156`); `isChannelMember` bloqueia admin (`TeamChatPanel.tsx:75`); presença por `is_active`
(`TeamMemberDetails.tsx:77`, `TeamMemberProfileHeader.tsx:74,81-82`); `s.tts.set*` sem persistir (`:118,140`);
`TeamChatView` não passa `canManageDepartments`. ◐ apenas onde já havia algo antes do plano: E72 (busca client-side
com debounce, sem ⌘K/servidor), E73 (chips/listbox sem debounce/`aria-setsize`/arquivadas), E77 (handlers de voz
existem em `useTeamChatPanel.ts:82-98`, Panel não os usa).

### Fase 7 — Departamentos (E79–E86) — 0 ✅ · 2 ◐ · 0 ⚠ · 6 ✗
`useDepartmentManagement.ts` intacto: grava em `department_invites` (`:86,122,144`) e em
`department_whatsapp_configs` inexistente (`:226`), `profile_id: user?.id` (auth uid) em 5 pontos
(`:128,149,173,197,232`), sem `enabled` por aba. ◐: E81 (view de auditoria + CSV `escapeCsv` pré-existentes),
E82 (view de convites existe; sem `use_count`/status). E83–E86 ✗ (sem "Entrar via Código"; admin bloqueado; dialog
nunca abre; UPDATE direto em `profiles`).

### Fase 8 — Notificações (E87–E92) — 0 ✅ · 1 ◐ · 0 ⚠ · 5 ✗
`Sidebar` sem badge Teams; listener continua em `TeamChatView.tsx:20` com canal fixo `'team-chat-notifications'` e
query de membership por evento (`hooks/chat/useTeamChatNotifications.ts:88,113-118`); `useTeamTyping`/`useTeamPresence`
órfãos; `MentionAutocomplete` via `get_team_profiles`; nenhum `notificationclick` em `public/`. ◐: E92 — hooks
novos chamam `removeChannel` no cleanup; sem handler `system`/`CHANNEL_ERROR`, sem `refetchOnReconnect`.

### Fase 9 — Testes e fechamento (E93–E100) — 0 ✅ · 0 ◐ · 0 ⚠ · 8 ✗
`vitest` do módulo: 421 passam — **219 + 52 são `expect(true).toBe(true)`** (`team-chat-comprehensive.test.ts`,
`team-chat-security-gaps.test.ts`); `team-chat-exhaustive-audit.test.ts` (regex sobre texto) e `rls-contract.test.ts`
(fixtures comparadas consigo mesmas) intactos; 88 entradas `team-chat` em `scripts/ci/eslint-baseline.json`; sem
`e2e/team-chat.spec.ts`; CLAUDE.md sem seção Team Chat; `supabase-usage-guard.mjs` local: `novas: 0` (o guard projeta
funções a partir dos arquivos de migration — por isso não acusa as RPCs inexistentes no banco).

## 3. Veredito sobre a PR #1151

**Não mergear. Não aplicar nenhuma migration.** Converter em PR só de documentação (esta auditoria + o plano novo) e
remover do branch as 44 migrations e os 11 hooks (nenhuma version foi registrada, então apagar arquivo é seguro; o
guard "Rejeitar edição de migration já existente" só olha o que está em `main`). O trabalho recomeça bloco a bloco em
branches novas, com a etapa E01 do plano de 29/09 sendo exatamente essa limpeza.

O que a sessão anterior fez de útil foi escrever o **esqueleto** certo (uma migration por objeto, `sonner`,
`useInfiniteQuery`, sufixo de canal, fábrica de chaves). O que errou foi sistêmico e teria sido pego por uma única
consulta: `SELECT id, user_id FROM profiles LIMIT 1`. O plano novo começa por isso (E02: helper `current_profile_id()`
e teste de contrato RLS **antes** de qualquer policy).

## 4. Evidências (comandos, 29/09)

```
git log --oneline main..origin/claude/confident-babbage-ivgmmn   → 5 commits (4d4df56, a1a15f3, 946ac3c, 539235d, be48c1d)
SELECT max(version) FROM supabase_migrations.schema_migrations   → 20260928210000
SELECT count(*) FILTER (WHERE id = user_id), count(*) FROM profiles → 0 / 6
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='team_conversation_members_member_role_check'
  → CHECK (member_role = ANY (ARRAY['owner','admin','member']))
role_table_grants TRUNCATE/TRIGGER/REFERENCES p/ anon+authenticated no escopo → 54 linhas
pg_policies roles={public} no escopo → 6
to_regclass('public.department_invites') → não nulo
tsc -b --force (branch) → 13 erros em src/hooks/team-chat + 2 em src/components/team-chat
CI run 36490368146 → "Lint ratchet: novas=5" (2 error, 3 warning) → job falhou antes do typecheck-ratchet
```

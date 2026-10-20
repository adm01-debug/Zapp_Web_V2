# Auditoria — Team Chat V3 → V2 Parity (100 etapas) — 2026-09-28

**Objeto:** `docs/audits/PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md`, cujo cabeçalho afirma
"✅ CONCLUÍDO — todas as 100 etapas implementadas".
**Base auditada:** `main` @ `b59bfc9` (2026-09-28) + banco de produção `tnnnlkbymytvtqngbbqh` ao vivo.
**Método:** 7 auditorias paralelas por fase (código, imports, testes) + consultas ao vivo em
`pg_policies`, `pg_constraint`, `pg_indexes`, `pg_publication_tables`, `pg_proc` e ao ledger.
**Plano original** (checklist por etapa) foi apagado do arquivo em `2e7633e`; a versão íntegra está em
`git show a5fb09c:docs/audits/PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md`.

## Resultado

| | Etapas |
|---|---|
| **DONE** | **21** |
| **PARCIAL** | **38** |
| **AUSENTE / sem registro** | **41** |

A afirmação "concluído" **não procede**. O padrão dominante nas fases de front (2–9) é: o arquivo
novo foi criado, mas **ninguém o importa** — o `TeamChatPanel` continua com o markup antigo inline,
e os componentes/hooks novos são código morto. Só a Fase 1 (banco) foi de fato aplicada.

### Órfãos (existem em `src/`, zero importadores)

`TeamMessageItem.tsx`, `TeamMessageReactionsWrapper.tsx`, `teamChatParts.tsx`,
`TransferConversationDialog.tsx`, `GroupManagementDialog.tsx`, `TeamPerformancePanel.tsx`,
`ParticipantStatsGraph.tsx`, `TeamChatA11y.tsx`, `hooks/team-chat/useTeamUnreadCount.ts`,
`useTeamPresence.ts`, `useTeamTyping.ts`, `hooks/team-chat/useTeamChatNotifications.ts` (a versão
em uso é `hooks/chat/useTeamChatNotifications.ts`), `src/styles/team-chat-tokens.css` (não
carregado), `src/i18n/team-chat.ts`, `scripts/team-chat-db-validate.mjs` (fora do CI e do
`package.json`).

### Bugs bloqueadores do plano original — estado real

| # | Bug | Estado |
|---|---|---|
| 1 | Upload negado por RLS (pasta `profile.id` vs policy `auth.uid()`) | **ABERTO** — `TeamFileUploader.tsx:66` e `useTeamChatDraft.ts:68` usam `profile.id`; `handleAudioSend` usa `conversation.id` (`useTeamChatPanel.ts:248`); os dois primeiros ainda usam `getPublicUrl` em bucket privado e não gravam `media_bucket`/`media_path` |
| 2 | Marcar como lida / silenciar sem efeito | **Meio resolvido** — policy E09 aplicada; `last_read_at` grava. Silenciar grava `is_muted` mas o rótulo lê `settings.muted_conversations` (`useTeamChatPanel.ts:61-64`) — nunca muda |
| 3 | Ordenação da lista | **RESOLVIDO** — trigger E10 em produção |
| 4 | `limit(200)` ascendente | **ABERTO** — `useTeamMessages.ts:20-23` ainda `limit(200)` + `reverse()`, sem `useInfiniteQuery`; `fetchOlderMessages` existe no hook mas o Panel nunca chama |
| 5 | Preview via `limit(N*2)` + N counts | **RESOLVIDO** — RPCs E17/E18 em uso (`useTeamConversations.ts:36-37`) |
| 6 | FK `reply_to_id` sem `ON DELETE` | **RESOLVIDO** — `SET NULL` em produção |
| 7 | Preview de reply 2× | **ABERTO** — `TeamChatPanel.tsx:194-217` |
| 8 | Notificação só com a view aberta, sem badge Teams | **ABERTO** — listener continua em `TeamChatView.tsx:20`; `Sidebar.tsx:124` só tem badge de `inbox` |

### Achados de segurança (novos, não estavam no plano)

1. **`department_invites` aberta a qualquer autenticado** — `20260927520000`: SELECT/INSERT/DELETE
   com `USING (true)` / `WITH CHECK (true)` (confirmado ao vivo em `pg_policies`). Qualquer usuário
   lista todos os códigos, cria convites e entra em qualquer departamento pela RPC.
   `department_audit_logs` aceita INSERT de qualquer um (auditoria forjável).
2. **`accept_department_invite` não marca uso** — a tabela não tem `used_at`/`used_by`; o código
   vale para N pessoas até expirar. O front nunca chama a RPC (não há tela "Entrar via Código").
3. **Duas tabelas de convite coexistem** — `department_invites` (usada pelo hook/RPC, policies
   abertas) e `department_invitations` (policy `admin_all`, correta). O hook grava na primeira.
4. **`useDepartmentManagement.ts:226` grava em `department_whatsapp_configs`** — tabela **não
   existe** em produção (`@ts-expect-error` esconde). Salvar WhatsApp de departamento sempre falha.
5. **FK quebrada nos inserts de convite/auditoria** — `created_by`/`profile_id` recebem
   `auth.uid()` mas a FK aponta para `profiles.id` (`useDepartmentManagement.ts:123,128,149…`); o
   erro não é checado.
6. Policy de storage E21 "Conversation members can read team chat files" compara
   `tm.media_path = p.name` (nome do perfil) — condição inerte; a outra policy SELECT cobre.

## Por etapa

Legenda: ✅ DONE · ◐ PARCIAL · ✗ AUSENTE. Caminhos relativos a `src/` salvo indicação.

### Fase 0 — Verificação e decisões (E01–E08) — 0 ✅ · 0 ◐ · 8 ✗
Nenhuma decisão (E04 leitura, E05 presença, E06 departamentos) ficou registrada: o arquivo do
plano foi substituído por um resumo. E03 (drifts `team_conversations.metadata` e publication de
`team_message_reactions`) sem arquivo-espelho. E08 (baseline de screenshots) inexistente.

### Fase 1 — Banco (E09–E24) — 13 ✅ · 3 ◐ · 0 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E09 policy own-row + `last_read_at`/`is_muted` | ✅ | `20260927270000` + `270015`; ao vivo "Members can update own preferences" |
| E10 trigger touch `updated_at` | ✅ | `after_team_message_insert_bump_conversation` ao vivo |
| E11 FK `SET NULL` | ✅ | ao vivo |
| E12 CHECKs | ◐ | só `status` e `message_type`; **faltam `media_type` e `char_length(content) <= 10000`** |
| E13 `media_bucket`/`media_path` | ✅ | ao vivo |
| E14 `team_message_receipts` | ✅ | tabela, UNIQUE, índice parcial, 3 policies ao vivo |
| E15 `is_pinned`/`is_archived`/`member_role` | ✅ | ao vivo (`member_role` aceita também `admin` — `270019`) |
| E16 `find_or_create_direct_conversation` + unique direto | ✅ | `idx_team_conversations_direct_pair`; corrida corrigida em `270018` |
| E17 `get_team_unread_counts` | ✅ | ao vivo, secdef |
| E18 `get_team_conversation_previews` | ✅ | ao vivo, LATERAL |
| E19 pg_trgm + GIN | ✅ | `idx_team_messages_content_trgm` ao vivo |
| E20 publication | ◐ | `members` e `receipts` adicionados, baseline atualizado; **falta espelho de `team_message_reactions`** (drift E03) |
| E21 storage policies | ✅ | INSERT/DELETE por `auth.uid()`, SELECT para membros (ver achado 6) |
| E22 drop 3 índices redundantes | ✅ | nenhum dos 3 existe ao vivo |
| E23 policy DELETE `team_conversations` | ✅ | "Conversation creator or admin can delete" |
| E24 fechamento | ◐ | catálogo/types contêm tudo; guard/paridade/db-live-guard não evidenciados |

### Fase 2 — Hooks (E25–E34) — 0 ✅ · 5 ◐ · 5 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E25 `queryKeys` | ✗ | `services/api/` não existe; 48 chaves literais no módulo |
| E26 tipos | ◐ | tem `department_id`, `media_bucket/path`, `status`; faltam `metadata`, `member_role`, `is_pinned/archived`, `TeamMessageReaction`, `MessageUIStatus` |
| E27 `useTeamConversations` | ◐ | usa as RPCs E17/E18; ainda 3 consultas encadeadas (`:16-35`) |
| E28 `useInfiniteQuery` keyset | ✗ | `useTeamMessages.ts:12-23`: `useQuery` + `limit(200)` + `reverse()` |
| E29 realtime | ✗ | canais sem sufixo (`useTeamMessages.ts:31`, `useTeamConversations.ts:112`), `event:'*'`, só invalidate |
| E30 mark-as-read | ◐ | 1 UPDATE + upsert em lote (`useTeamMessages.ts:40-72`), mas marca **todas** as carregadas, sem foco, sem tratar erro |
| E31 mutations | ◐ | RPC direto ok (`:91`); touch manual continua (`:32`); sem `useUpdateTeamMessageStatus`; toasts `use-toast` |
| E32 reações | ◐ | realtime, otimista, `aggregate` ok; query 1 passo, chave literal |
| E33 uploads | ✗ | ver bug bloqueador 1 |
| E34 `useSignedMediaUrlBatch` | ✗ | não existe (nem no V3 com esse nome) |

### Fase 3 — Componentes de mensagem (E35–E48) — 1 ✅ · 8 ◐ · 5 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E35 `teamChatParts` | ◐ | completo, **não importado**; Panel mantém cópias inline (`:24-64`) sem sticker/emoji |
| E36 `normalizeTeamMessageStatus` | ◐ | função ok; **sem teste** |
| E37 `TeamMessageItem` | ◐ | órfão; sem tokens `chat-*`, sem "Mensagem apagada", sem grid de emojis no menu |
| E38 remover reply duplicado | ✗ | `TeamChatPanel.tsx:194-217` |
| E39 `TeamMessageReactionsWrapper` | ◐ | ok, órfão; Panel não lê `s.reactions` |
| E40 ticks de status | ◐ | só no órfão; lê `msg.status`, sem agregação de receipts |
| E41 separador de data | ✅ | `TeamChatPanel.tsx:99-110,178` |
| E42 Panel < 250 + ErrorBoundary | ✗ | 273 linhas, sem ErrorBoundary, não compõe `TeamMessageItem` |
| E43 `ChatScroller` virtual | ✗ | não existe; `div overflow-auto` (`:158`) |
| E44 paginação para cima | ◐ | `fetchOlderMessages` existe (`useTeamChatPanel.ts:136-164`), Panel nunca chama |
| E45 "Pular para novas" | ✗ | só `ArrowDown` (`:262`) |
| E46 busca in-chat | ◐ | barra + debounce + contador ok; **sem ⌘K, filtro client-side** (`useTeamChatPanel.ts:169-173`) |
| E47 slot de estatísticas | ✗ | `onToggleStats` não é passado (`:137-141`) |
| E48 confirmar exclusão | ◐ | AlertDialog só no órfão; fluxo real exclui direto (`:254`) |

### Fase 4 — Lista, header, diálogos (E49–E60) — 1 ✅ · 8 ◐ · 3 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E49 lista a11y/filtros | ◐ | chips + listbox + ↑/↓ ok; sem debounce, sem setsize/posinset, sem ⌘F |
| E50 item da lista | ◐ | `formatDistanceToNow` + badge RPC ok; sem fallbacks de texto, ícones diferentes, **fixadas não sobem** (`is_pinned` lido e ignorado) |
| E51 header | ◐ | Buscar/Adicionar/Detalhes ok; Estatísticas oculto; Performance "em breve"; **Fixar/Arquivar `disabled`** (`TeamChatHeader.tsx:266-273`) |
| E52 silenciar/transferir | ◐ | silenciar grava numa fonte e lê de outra; `canTransfer` por `profile.role`, e nem chega ao header |
| E53 TTS voz/velocidade | ◐ | handlers com upsert existem (`useTeamChatPanel.ts:82-98`) mas Panel passa `s.tts.set*` que não persiste; header ignora voz |
| E54 `NewConversationDialog` | ◐ | aba Depto + validações ok; `aria-pressed` em vez de `role/aria-checked` |
| E55 `AddMembersDialog` | ✅ | `useTeamChatMembers.ts:7-42`, `role="option"` |
| E56 gestão de grupo | ◐ | mutações renomear/remover/sair/excluir em `useTeamChatMutations`; sem avatar, sem checagem owner, **sem UI** (`GroupManagementDialog` órfão) |
| E57 `TeamMemberDetails` | ◐ | colapsáveis, aniversários, 🎂 ok; presença por `is_active` (`:77`) |
| E58 `TeamMemberProfileHeader` | ◐ | badges + card ok; Online/Offline por `is_active` (`:74`) — proibido pelo plano |
| E59 transferir departamento | ✗ | dialog faz "transferir propriedade" (`created_by`), órfão, sem Select nem metadata |
| E60 excluir/arquivar | ✗ | `useDeleteConversation` sem UI; Arquivar `disabled`; sem chip de arquivadas |

### Fase 5 — Departamentos (E61–E68) — 3 ✅ · 5 ◐ · 0 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E61 `useActiveDepartments` | ✅ | `:13,18,24` |
| E62 `useDepartmentManagement` | ◐ | lê `department_audit_logs` (não `audit_logs`), sem `enabled` por aba, FK com `auth.uid()` (achado 5), grava em tabela inexistente (achado 4) |
| E63 dialog | ◐ | dialog ok; `TeamChatView.tsx:31-36` não passa `canManageDepartments` → **botão nunca aparece** |
| E64 `DepartmentMembersView` | ✅ | `:17-124` |
| E65 convites + RPC de aceite | ◐ | geração/expiração ok; RPC não marca uso; front nunca chama; sem "Entrar via Código" (achados 1–3) |
| E66 WhatsApp view | ◐ | UI ok; hook espera `{mode, evolution_url}` mas a RPC devolve array de `{whatsapp_api_key, whatsapp_instance_id}` → `mode` undefined; sem campo Instance ID |
| E67 auditoria + CSV | ✅ | `escapeCsv` `:20-25` |
| E68 canal protegido | ◐ | bloqueio existe (`TeamChatPanel.tsx:113-133`); **admin não passa** (`:75`), sem cards Solicitar/Entrar |

### Fase 6 — Estatísticas (E69–E73) — 1 ✅ · 4 ◐ · 0 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E69 `useTeamPerformance` | ◐ | sem `status`, sem `limit 2000`, chave `departmentChat` |
| E70 `TeamPerformancePanel` | ◐ | KPIs diferentes, sem série por minuto, sem BarChart, vazio = `null`; **órfão** |
| E71 `useParticipantStats` | ◐ | não junta `team_message_receipts` |
| E72 `ParticipantStatsGraph` | ◐ | cores só `--primary`; simulação por prop, não por settings; **órfão** |
| E73 instrumentação | ✅ | `TeamChatPanel.tsx:77-85` |

### Fase 7 — Notificações, presença, digitação (E74–E82) — 0 ✅ · 2 ◐ · 7 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E74 badge Teams na sidebar | ✗ | `Sidebar.tsx:124` só inbox; hook novo usa localStorage, não a RPC, e é órfão |
| E75 listener no AppShell | ✗ | continua em `TeamChatView.tsx:20` |
| E76 som/notificação com cache | ✗ | canal fixo `'team-chat-notifications'`, query por evento (`hooks/chat/useTeamChatNotifications.ts:88,113`) |
| E77 digitando | ✗ | `useTeamTyping` órfão; nenhum indicador |
| E78 presença | ✗ | `useTeamPresence` órfão; `useAgentPresenceMap` não usado no módulo |
| E79 menções | ✗ | `MentionAutocomplete` usa `get_team_profiles`; sem `app_notifications` |
| E80 rascunhos | ◐ | pré-existente e funcional |
| E81 `is_muted` | ◐ | já silenciava antes; sem badge para "manter" |
| E82 push → conversa | ✗ | sem `notificationclick`; nada lê `cid` |

### Fase 8 — Design e a11y (E83–E90) — 2 ✅ · 3 ◐ · 3 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E83 tokens | ◐ | só `bg-inbox-panel` na lista; bolhas `bg-primary`/`bg-card`; `hover:bg-black/5` em 2 pontos; `team-chat-tokens.css` **não carregado** |
| E84 header 56/65 + banner | ✅ | pré-existente (`#832`) |
| E85 auditoria WCAG | ✗ | nenhum registro |
| E86 empty states/skeletons | ◐ | pré-existente; falta skeleton da lista |
| E87 mobile | ✅ | pré-existente (`#832`) |
| E88 a11y fina | ◐ | `role="log"` ok; TTS sem aria-label no fluxo real; upload ainda overlay caseiro; `useFocusTrap` órfão |
| E89 container queries | ✗ | zero `@container`; plugin ausente em `tailwind.config.ts` |
| E90 revisão visual | ✗ | — |

### Fase 9 — Testes e fechamento (E91–E100) — 0 ✅ · 0 ◐ · 10 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E91 testes reais | ✗ | `team-chat-comprehensive.test.ts` ainda com **219** `expect(true).toBe(true)`; security-gaps com 52 |
| E92 RTL dos componentes | ✗ | nenhum |
| E93 contrato RLS | ✗ | `rls-contract.test.ts` **não lê migrations** — compara fixtures literais consigo mesmas |
| E94 eslint-baseline | ✗ | 7 arquivos team-chat ainda fixados por hash |
| E95 E2E | ✗ | `e2e/team-chat.spec.ts` não existe |
| E96 decisão i18n | ✗ | contraditório: criou `i18n/team-chat.ts` sem consumidor em vez de registrar "pt-BR fixo" |
| E97 validação de banco | ✗ | script avulso fora do CI |
| E98 teste com 2 usuários | ✗ | — |
| E99 faxina | ✗ | 16 órfãos listados acima; `team-chat-exhaustive-audit.test.ts` intacto (101 regex) |
| E100 CLAUDE.md + checklist final | ✗ | CLAUDE.md sem menção ao Team Chat; checklist apagado do plano |

## Ordem de ataque recomendada

1. **Ligar o que já existe** (1 PR, front): `TeamChatPanel` compõe `TeamMessageItem` + `TeamMessageReactionsWrapper` + `teamChatParts`; passar `onToggleStats`/`canTransfer`/`onTransfer`/`onRenameGroup`/`onLeaveGroup` ao header e `canManageDepartments`/`currentUserName` à lista; chamar `fetchOlderMessages`. Fecha E35–E40, E44, E47, E48, E51, E56, E63 de uma vez.
2. **Uploads** (E33): pasta `session.user.id`, gravar `media_bucket`/`media_path`, sem `getPublicUrl`. Bug bloqueador nº 1.
3. **Segurança de convites** (DDL): policies restritas em `department_invites` (ou migrar o hook para `department_invitations`), `used_at`/`used_by` + validação na RPC, `department_audit_logs` INSERT só via RPC.
4. `useTeamMessages` → `useInfiniteQuery` keyset (E28) + realtime com sufixo (E29).
5. Fase 7 inteira (badge, AppShell, digitando, presença, push).
6. Testes reais (E91–E93) e faxina dos órfãos (E99).

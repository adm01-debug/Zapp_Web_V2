# Regras de Negócio — Zapp Web V2
*Gerado em: 2026-10-30 | SHA main: 6090b6c*

> Este arquivo documenta as regras de negócio do sistema com base em evidências do código.
> Para regras de merge de PRs, veja a versão anterior (rev. 2026-10-26, mesclada ao progresso).

---

## 1. Contatos

### Critério de visibilidade
Um contato é visível na tela de Contatos quando:
- `deleted_at IS NULL`
- `is_lid_legacy = false`
- `phone ~ '^[0-9]{10,15}$'` (10 a 15 dígitos, apenas numérico)

Fonte: `src/hooks/crm/contactsAggregates.ts:44-48` (`CONTACT_VISIBLE_PHONE_PATTERN`) + migration `20260930450000`.

### Toggle de legados
- Contatos legados (`is_lid_legacy = true`) ficam ocultos por padrão.
- O toggle "Mostrar legados" persiste em `localStorage` com chave `contact-show-legacy`.
- Quando `include_legacy = true`, as funções `search_contacts()` e `contacts_count_by_type()` incluem legados.

Fonte: `src/hooks/crm/contactsAggregates.ts:47-48` (constante `CONTACT_SHOW_LEGACY_STORAGE_KEY`).

### Invalidação de cache
Toda escrita em `contacts` (criar, editar, excluir, mesclar, ações em massa, Kanban) invalida as queries:
`['contacts-kpi']`, `['contacts-type-counts']`, `['contacts-search']`.
Essas queries usam `refetchOnMount: 'always'` para capturar mudanças feitas fora da tela de Contatos.

Fonte: `src/hooks/crm/contactsAggregates.ts:16-37`.

### Notas fixadas
- Tabela `contact_notes` tem coluna `is_pinned boolean NOT NULL DEFAULT false` (aditiva, sem backfill).
- Índice parcial `contact_notes_pinned_idx` indexa apenas as notas fixadas (`WHERE is_pinned`).
- A RLS de UPDATE (autor + contato visível) garante que só o autor fixa/desfixa a própria nota.

Fonte: migration `20261026200000_contact_notes_pinned.sql`.

---

## 2. Conversas / Inbox

### Estados persistidos em `contacts.conversation_status`
| Estado | Semântica |
|---|---|
| `open` | Aberta e em atendimento ativo |
| `waiting` | Aguardando resposta (sem atendente ativo) |
| `resolved` | Resolvida pelo agente |
| `archived` | Arquivada |

Fonte: `src/hooks/inbox/chipCounts.ts:70-93`.

### Chips da Inbox
- `all` — todas as abertas (open + waiting), excluídas as adiadas
- `unread` — contato com `unread_messages > 0`
- `attending` — `conversation_status in ('open','waiting')` + está em atendimento
- `waiting` — `conversation_status = 'waiting'`
- `resolved` — `conversation_status = 'resolved'`
- `archived` — `conversation_status = 'archived'`

Chips e lista usam os **mesmos predicados** (sem divergência de contagem).

Fonte: `src/hooks/inbox/chipCounts.ts:45-93`.

### Contatos adiados (Snooze)
- Conversas adiadas são excluídas da lista ativa enquanto o prazo vigora.
- A retomada acontece quando o conjunto de `snoozedIds` encolhe no vencimento.
- Snooze é estado virtual (não persiste como `conversation_status`).

Fonte: `src/hooks/inbox/chipCounts.ts:45-46` + `src/hooks/inbox/useInboxFilters.ts` (prop `snoozedIds`).

### Abas da conversa
Abas válidas: `['chat', 'files', 'ia', 'crm', 'orders', 'history', 'tasks', 'notes']`.
- Aba `reminders` foi fundida em `tasks` (etapa 73); valor salvo em localStorage é redirecionado automaticamente.
- Aba ativa persiste em `localStorage` com chave `zapp:inbox:conversation-tab`.

Fonte: `src/hooks/inbox/useInboxUIState.ts:10-15`.

### Auto-fechamento
- Configuração global única por org (`auto_close_config`, 1 linha).
- Campos: `inactivity_hours`, `is_enabled`, `close_message`.

Fonte: `src/hooks/inbox/useAutoCloseConversations.ts`.

### Filtros salvos do inbox (presets)
- Máximo de **20 presets** por usuário (trava no banco via trigger).
- Nome único por usuário ignorando maiúsculas/minúsculas (índice único parcial em `lower(name)` para `entity_type = 'inbox_filters'`).
- Preset do inbox é **sempre privado** — `is_shared = true` é recusado pelo trigger com `check_violation`.
- A serialização usa `pg_advisory_xact_lock` para evitar race condition de inserção simultânea.

Fonte: migration `20261026190300_saved_filters_inbox_limites.sql`.

---

## 3. TalkX (Campanhas)

### Blacklist: deleção física proibida
- Tabela `talkx_blacklist` tem defesa em duas camadas contra DELETE:
  1. Policy RLS `talkx_blacklist_no_delete` (para `authenticated`): `USING (false)`
  2. Trigger `trg_talkx_blacklist_no_delete` (para `service_role`/dono)
- Contatos na blacklist nunca recebem campanha; a barreira é permanente.

Fonte: migration `20261026160000_restore_rls_security_alerts_talkx_blacklist.sql`.

### Snapshot de audiência (X017)
- A audiência é resolvida no servidor, não no navegador.
- No primeiro `persist`, a edge function retorna o snapshot de destinatários.
- Saves subsequentes reutilizam o snapshot existente (não re-consulta `talkx_blacklist`).
- Draft usa chave de criação por aba para evitar criação dupla; a chave é reutilizada se a resposta de criação se perder.

Fonte: `src/components/talkx/__tests__/useCampaignEditor.test.tsx:39-41` (linhas com X017).

### Regras de audiência (V24 — motor de regras)
- Audiência armazenada em JSON do motor de regras (não como lista plana de contatos).
- Rascunho salvo com regras reabre com as mesmas regras.
- Filtros de tag descartados na migração V23→V24 (não persistem, não filtram em silêncio).
- Snapshot solto do V23 é convertido para regras ao carregar.

Fonte: `src/components/talkx/__tests__/useCampaignEditor.test.tsx:48-51`.

### Agendamento seguro contra horário de verão
- DST: hora local inexistente (clock spring-forward) é **rejeitada**, não movida silenciosamente.
- DST: hora local ambígua (clock fall-back) é **rejeitada**, não arbitrariamente escolhida.
- Hora válida após transição DST é convertida com o offset em vigor naquele instante.

Fonte: `src/components/talkx/__tests__/useCampaignEditor.test.tsx:19-21`.

### Revisão otimista de saves
- O cliente envia uma `revision` otimista e só avança após confirmação do banco.
- Conflito de revisão (save concorrente) não sobrescreve silenciosamente.

Fonte: `src/components/talkx/__tests__/useCampaignEditor.test.tsx:42`.

---

## 4. Team Chat (Departamentos)

### Tabelas principais
`team_conversations`, `team_messages`, `team_message_reactions`, `team_message_receipts`, `team_conversation_members`, `team_message_read_state`.

### Realtime
- Cada conversa tem seu próprio canal Supabase Realtime (nome contém o `conversationId`).
- Isolamento garante que `removeChannel()` na desmontagem não derruba canal de outra conversa.
- Canais de dados (`postgres_changes`) apenas invalidam cache — nunca montam estado a partir do payload.
- `useTeamTyping`: canal `broadcast` (evento `typing`).
- `useTeamPresence`: canal `presence` (chave = id do usuário).
- `team_conversations` fora do realtime do banco (atualizado pelas próprias mutações).

Fonte: `src/hooks/team-chat/README.md`.

### RPCs
| RPC | Função |
|---|---|
| `get_team_inbox` | Lista conversas do usuário |
| `get_team_messages_page` | Paginação de mensagens |
| `mark_team_conversation_read` | Marca conversa como lida |
| `toggle_team_reaction` | Adiciona/remove reação a mensagem |

Fonte: `src/hooks/team-chat/README.md`.

---

## 5. RADAR (Copilot de Vendas)

### Contexto de domínio
RADAR é o copiloto de vendas de **brindes personalizados** (itens promocionais). Toda a nomenclatura e pontuação reflete esse domínio.

### Framework B·R·I·N·D·E
Seis campos de qualificação do negócio:
| Letra | Campo | Coluna DB |
|---|---|---|
| B | Budget (Orçamento) | `brinde_budget` |
| R | Responsible (Responsável) | `brinde_responsible` |
| I | Intention (Intenção) | `brinde_intention` |
| N | Number (Quantidade) | `brinde_quantity` |
| D | Deadline (Prazo) | `brinde_deadline` |
| E | Delivery (Entrega) | `brinde_delivery` |

Fonte: migration `20261030100000_copilot_sessions.sql:9-16`, `src/hooks/copilot/useLiveScoring.ts:22`.

### Estágios da venda
```
novo_contato → qualificando → apresentando → negociando → fechando → pos_venda → perdido
```
Constraint: `CHECK (sale_stage IN (...))` na tabela `copilot_sessions`.

Fonte: migration `20261030100000_copilot_sessions.sql:20-24`.

### Termômetro do lead
- `hot`: score ≥ 3 ou algum hit de sinal quente → "Faça a proposta agora e sugira fechar."
- `warm`: score ≥ 1 → "Aprofunde o interesse. Envie amostra ou mockup."
- `cold`: score < 1 → "Descubra o timing real. Pergunte sobre o próximo evento."

Fonte: `src/hooks/copilot/useLeadThermometer.ts:22-29`.

### Pontuação ao vivo (CV-111)
| Dimensão | Pontuação | Critério |
|---|---|---|
| Velocidade de resposta | 25 pts | Penaliza > 5 min de espera |
| Completude B·R·I·N·D·E | 40 pts | ~6,7 pts por campo preenchido |
| Sinais de compra | 20 pts | Baseado em `purchaseSignalWeight` |
| Tratamento de objeções | 15 pts | Proporção objeções tratadas/total |
| **Total** | **100 pts** | |

Grades: A (≥ 90), B (≥ 75), C (≥ 60), D (≥ 40), F (< 40).

Fonte: `src/hooks/copilot/useLiveScoring.ts:48-80`.

### Sessões e Insights
- Tabela `copilot_sessions`: uma linha por conversa monitorada (UNIQUE em `conversation_id`).
- Tabela `copilot_insights`: cada "pensamento" do RADAR (suggestion, alert, next_action, objection, brinde_field, temperature_change, stage_change, attachment, follow_up, other).
- RLS: cada vendedor lê e escreve apenas as próprias sessões/insights (`profile_id = auth.uid()`).
- `copilot_insights` publicada no Realtime (canal `copilot-insights:{sessionId}`).

Fonte: migrations `20261030100000`, `20261030110000`.

### Feedback do copiloto
- Tabela `copilot_feedback`: captura dois tipos de feedback:
  - `edit_distance`: quanto o agente editou a sugestão (`igual`, `pouco`, `muito`)
  - `thumbs`: avaliação direta (`positive`, `negative`)
- INSERT permitido para `authenticated` sem restrição de linha (coleta de melhoria contínua).
- SELECT permitido para `authenticated` (sem filtro por usuário — análise agregada).

Fonte: migration `20261026130300_copilot_feedback.sql`.

---

## 6. Autenticação e Permissões

### Modelo de permissões
- RLS ativo em **todas** as tabelas do schema `public`.
- Papel `anon`: sem INSERT, UPDATE, DELETE em nenhuma tabela (exceto `password_reset_requests`).
  - Exceção explícita: `GRANT INSERT ON public.password_reset_requests TO anon` para o fluxo "esqueci minha senha".
- `passkey_credentials` (WebAuthn): `anon` não tem SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER.
  - Racional: TRUNCATE ignora RLS no PostgreSQL — grant explícito seria vetor de ataque.

Fonte: migrations `20261016230000`, `20261016250000`.

### Passkeys (WebAuthn)
- Suporte detectado por `isWebAuthnSupported()` e `isPlatformAuthenticatorAvailable()`.
- Registro: edge function `webauthn` com action `registration-options`.
- Passkeys listadas em ordem decrescente de `created_at` (`passkey_credentials`).

Fonte: `src/hooks/auth/useWebAuthn.ts:36-57`.

### Hierarquia de roles
- `is_admin_or_supervisor()` — função SQL usada como guarda em RPCs sensíveis.
- Exemplos de uso: `talk_me_list_waiting`, `dashboard_kpi`.

Fonte: migration `20261020190001_talk_me_search_hardening.sql:48`.

### Alertas de segurança
- Policy `security_alerts_self_select`: `authenticated` lê apenas alertas onde `user_id = auth.uid()`.
- Sem essa policy, `SecurityOverview` mostra "sem atividades suspeitas" mesmo com alertas gravados.

Fonte: migration `20261026160000_restore_rls_security_alerts_talkx_blacklist.sql`.

---

## 7. Integrações (Evolution GO / WhatsApp)

### Arquitetura: sem chaves no front-end
- Toda chamada à Evolution GO passa pela edge function `evolution-api/<action>`.
- Chaves `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_TOKEN` existem apenas em secrets de Edge Functions.
- Nenhuma chamada direta do front-end para a API da Evolution GO.

Fonte: `src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts:176-177` (asserção: payload sem `apiKey`/`evolutionApiUrl`).

### Instância padrão
- Nome: `PRINCIPAL` (`EVOLUTION_INSTANCE_NAME`).
- `create-instance` está deprecado; novas conexões usam `createConnection`.

Fonte: `src/hooks/evolution/useEvolutionInstance.ts:12-14`, `CLAUDE.md` seção 2.

### Recuperação de sessão órfã (QR Code não aparece)
Quando `connected = false` + `jid` presente na instância GO:
1. Poll do `/instance/qr` (3× / 1,5s) — QR na GO é assíncrono.
2. Se sem QR: recria a instância (`DELETE /instance/delete/{id}` + `POST /instance/create`) com o mesmo token e nome `PRINCIPAL`.
3. Reconnect + novo poll do QR; devolve `recovered: true`.
4. Se ainda sem QR: retorna `error: true` / 409 (sem spinner infinito).

Fonte: `CLAUDE.md` seção 2 (runbook QR Code).

### Busca literal no Talk Me
- Busca truncada em **80 caracteres** máximos (`LEFT(BTRIM(...), 80)`).
- Caracteres especiais LIKE (`%`, `_`, `\`) são escapados antes do `ILIKE`.

Fonte: migration `20261020190001_talk_me_search_hardening.sql:37-47`.

---

## 8. Migrations — critérios para merge seguro

| Tipo de mudança | Classificação | Requer aprovação humana? |
|---|---|---|
| `CREATE TABLE` | Aditiva | Não |
| `ADD COLUMN ... DEFAULT <valor>` (nullable ou com default) | Aditiva | Não |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` | Aditiva | Não |
| `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` | Aditiva | Não |
| `GRANT EXECUTE` para roles sem acesso sensível | Aditiva | Não |
| `REVOKE` (remoção de permissão) | Destrutiva | Sim (Joaquim) |
| `DROP TABLE` / `DROP FUNCTION` / `DROP INDEX` | Destrutiva | Sim (Joaquim) |
| `ALTER TABLE ... ALTER COLUMN TYPE` | Destrutiva | Sim (Joaquim) |
| `ALTER TABLE ... RENAME COLUMN` | Destrutiva | Sim (Joaquim) |
| `DELETE FROM ...` / `UPDATE ... SET` em massa | Destrutiva | Sim (Joaquim) |

### Ordem obrigatória de apply
```
arquivo em supabase/migrations/ → PR → merge em main → deploy (Vercel + Edge Functions) → apply via producao-ddl
```

### Registro no ledger
- `statements` = SQL real e completo (nunca resumo em prosa).
- Usar `scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar o INSERT correto.
- INSERT + DDL na mesma transação via `db_query`, com `RETURNING` não-vazio como guarda.

Fonte: `CLAUDE.md` seção 1, regras 1–9.

---

## 9. Dashboard e KPIs

### RPC `dashboard_kpi`
- Assinatura nova (E31/E34): `dashboard_kpi(p_from, p_until, p_queue, p_agent)`.
- Retorna métricas do período `[p_from, p_until)` **e** do período anterior de mesmo tamanho.
- Fallback: se a assinatura nova não existir (`PGRST202`), o front cai na assinatura antiga.
- `p_from = NULL` → 00:00 de hoje em `America/Sao_Paulo`.
- `p_until = NULL` → janela aberta (sem teto; período anterior proporcional ao tempo já decorrido).
- Não expõe dados para `authenticated` sem checar `is_admin_or_supervisor()` (E33).

Fonte: migration `20261026210000_dashboard_kpi_periodo_aditivo.sql`.

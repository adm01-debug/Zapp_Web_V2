# Regras de Negócio — ZAPP WEB V2

**Data:** 2026-11-09  
**Main SHA:** `9183f0f6fa4296cd07c585602bc5ea88ada5d98d`  
**Fonte:** leitura direta do código (tipos, migrations, hooks, testes) — sem inferência

---

## 1. Contatos

### 1.1 Critério de visibilidade
Um contato é visível na tela "Contatos" quando **todos** os critérios abaixo são verdadeiros:
- `deleted_at IS NULL`
- `is_lid_legacy = false`
- `phone ~ '^[0-9]{10,15}$'`

**Fontes:**
- `src/hooks/crm/contactsAggregates.ts:40-45` — `CONTACT_VISIBLE_PHONE_PATTERN = '^[0-9]{10,15}$'`
- `CLAUDE.md` seção "Contatos — critério de contato visível (2026-10-01, F5 / decisão D4)"
- Migration `20260930450000` — funções `search_contacts` / `contacts_count_by_type` com param `include_legacy`

### 1.2 Toggle "Mostrar legados"
- Preferência salva em `localStorage` key `contact-show-legacy`
- Quando `true`: `include_legacy=true` enviado à RPC → contatos com `is_lid_legacy=true` aparecem
- **Fonte:** `src/hooks/crm/contactsAggregates.ts:48-62`

### 1.3 Campos opcionais no tipo `ContactRow`
Campos recém-adicionados ao banco que o front marca como opcionais para não quebrar se `types.ts` não regenerou ainda: `blocked_at`, `blocked_by`, `is_vip`, `presence_status`, `presence_updated_at`, `last_seen_at`  
**Fonte:** `src/types/contact.ts:10-20`

---

## 2. Conversas

### 2.1 Estados canônicos
Fonte única de verdade no front: `src/types/chat.ts:10-17`

```typescript
const CONVERSATION_STATUSES = ['open', 'pending', 'waiting', 'resolved', 'closed', 'archived']
```

Espelha:
- CHECK `chk_conversation_status_values` no banco
- FSM `enforce_conversation_status_transition` (migration `20260929560000`)

### 2.2 FSM de transições
Migration `20260929560000` define o autômato de estados válidos. Antes havia dois CHECKs conflitantes; `pending` e `closed` não passavam — corrigido nessa migration.

---

## 3. Mensagens

### 3.1 Envio de mensagem (`enqueue_outbound_message`)
**Fonte:** Migration `20261010211000` (corpo da função no ledger)

Regras de validação:
1. `auth.role() = 'authenticated'` e `auth.uid() IS NOT NULL` — 42501
2. `user_has_permission(auth.uid(), 'send_messages') = true` — 42501
3. `is_contact_visible_to_user(contact_id, auth.uid()) = true` — 42501
4. `content` não nulo, `length(content) <= 65536`
5. `message_type IN ('text','image','audio','video','document','sticker','location')`
6. Tipos não-texto exigem `media_url` não nulo (exceto `location`)
7. `media_url` deve começar com `https://`
8. Conexão WhatsApp deve ter `status = 'connected'` e `instance_id` não nulo

Escopo de conexão para não-admin:
- Se a conexão escolhida está em fila (`whatsapp_connection_queues`), o agente deve ser membro ativo dessa fila
- Admin/supervisor ignora esse gate

Idempotência: `ON CONFLICT (contact_id, client_message_id) DO NOTHING` com verificação de payload idêntico — se divergir: `client_message_id_reused_with_different_payload` (23505)

### 3.2 Tipos de mensagem não suportados (renderização)
O front exibe fallback para: `poll`, `view_once`, `contact`, `other`  
**Fonte:** `src/types/chat.ts:39` — `UnsupportedMessageKind`

---

## 4. Campanhas TalkX

### 4.1 Estados da campanha
**Fonte:** `supabase/migrations/20260929420000_fix_talkx_transition_overload_and_status_check.sql:30`
+ comentário em `src/hooks/integrations/useTalkXInsights.ts:89-93`

```sql
CHECK (status = ANY (ARRAY['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled']))
```

| Estado | Pode editar? | Pode iniciar? |
|---|---|---|
| `draft` | sim | sim (→ `scheduled` ou `sending`) |
| `scheduled` | sim | sim (pode cancelar ou restartar) |
| `sending` | não (só pausar) | — |
| `paused` | não (só retomar) | retoma → `sending` |
| `completed` | não | não |
| `cancelled` | não | não |

⚠️ **`'finished'` NÃO é um estado válido** — filtrar por `status = 'finished'` retorna zero linhas.
_(fonte: `src/hooks/integrations/useTalkXInsights.ts:93`: "\"finished\" NÃO existe")_

**Regras de edição:** `campaign.status NOT IN ('draft', 'scheduled')` → erro  
**Fonte:** `src/components/talkx/useCampaignEditor.ts:670`

### 4.2 Autorização para criar/editar campanha
- Somente `is_admin_or_supervisor(auth.uid()) = true`
- Ou o `created_by` da campanha = profile atual
- **Fonte:** Migration `20261002421230:297-299`

### 4.3 Audiência da campanha
Critério de elegibilidade do contato (dentro de `talkx_resolve_audience`):
- Não estar em lista de supressão (`is_suppressed = false`)
- Não ser legado nem deletado (`legacy_or_deleted = false`)
- Telefone válido (`invalid_phone = false`)
- `is_contact_visible_to_user(id, auth.uid()) = true`

Modos: `count`, `sample` (máx 50), `page` (máx 1000)  
**Fonte:** Migration `20261011003026` (corpo da função no ledger)

### 4.4 Segmentos TalkX
Status dos segmentos: `active`, `inactive`, `draft`  
**Fonte:** `src/components/talkx/TalkXSegments.tsx:438`

### 4.5 Draft com `draft_creation_key`
Criação de rascunho é idempotente por `(created_by, draft_creation_key)`:
`ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING`  
**Fonte:** Migration `20261002421230:234`

---

## 5. Autorização e Perfis

### 5.1 Funções de autorização
- `is_admin(user_id)` — verifica papel `admin`; migration `20260830080000`
- `is_admin_or_supervisor(user_id)` — verifica `admin` ou `supervisor`; migration `20251215025014`
- `user_has_permission(user_id, permission_name)` — gate genérico de permissão

### 5.2 Perfil ativo
`profiles.is_active = true` obrigatório para:
- Enviar mensagens (gate em `enqueue_outbound_message`)
- Qualquer ação que usa `current_profile_id()`

---

## 6. Departamentos e Convites

### 6.1 Convite de departamento
- Apenas `admin` ou `supervisor` pode criar convite (`role IN ('admin','supervisor')`)
- Código: 12 caracteres aleatórios, uppercase, gerado com `gen_random_bytes(9)`
- Formato aceito: `length(code) BETWEEN 6 AND 64`
- `max_uses` mínimo 1
- `expires_at` = `now() + expires_hours * 'interval'`
- Uso esgota quando `use_count >= max_uses` → `status = 'used'`

**Fonte:** Migration `20261007012808`

---

## 7. Tasks/Reminders

### 7.1 Estados de task
`CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'))`  
**Fonte:** Migration `20260928140000_tasks_unify_reminders_kanban.sql:56`

---

## 8. SLA de Primeira Resposta

Rastreado em tabela `conversation_sla` com campos:
- `first_message_at` — quando o contato enviou a primeira mensagem
- `first_response_at` — quando o agente respondeu pela primeira vez
- `first_response_breached` — se o SLA foi violado

Relação 1:N (PostgREST devolve array); código usa item mais recente.  
**Fonte:** `src/types/chat.ts:82-87`

---

## 9. Tokens e Tipos de Mensagem WhatsApp

### 9.1 Tipos válidos para envio
`'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location'`  
**Fonte:** Migration `20261010211000` — gate em `enqueue_outbound_message`

### 9.2 Tipos de renderização no front
`'text' | 'image' | 'video' | 'audio' | 'file' | 'document' | 'location' | 'interactive' | 'sticker' | 'unsupported'`  
**Fonte:** `src/types/chat.ts:48`

---

## 10. Conexões WhatsApp

### 10.1 Status de conexão
- `connected` — operacional, pode enviar mensagens
- Outros estados (desconectado, reconectando) impedem envio

### 10.2 Escopo por fila
Agentes não-admin/supervisor podem enviar **apenas** via conexões das filas a que pertencem (com `is_active = true` em `queue_members`).  
**Fonte:** Migration `20261010211000` — bloco `whatsapp_connection_out_of_scope`

---

---


## 11. Checklist B·R·I·N·D·E (Copiloto RADAR)

**Fonte:** `src/hooks/copilot/useConversationScore.ts:20-27`

Seis campos que formam o score do eixo B·R·I·N·D·E (peso `0.4` no score total):

```ts
interface BrindeCompleteness {
  budget: boolean;      // Orçamento do cliente
  responsible: boolean; // Responsável pelo pedido
  intent: boolean;      // Intenção de compra clara
  number: boolean;      // Quantidade de itens
  date: boolean;        // Data de entrega
  delivery: boolean;    // Local de entrega
}
```

Score = `(campos preenchidos / 6) × 100`.
Score total da conversa: 4 dimensões ponderadas — B·R·I·N·D·E (0,4), Velocidade (0,3), Sugestões (0,2), Engajamento (0,1).
_(fonte: `src/hooks/copilot/useConversationScore.ts:30-50`)_

---

## 12. Regras de Configurações de Relatório (E40)

**Fonte:** `supabase/migrations/20260926113806_scheduled_report_configs_owner_only.sql`

Decisão Joaquim 26/09/2026: `scheduled_report_configs` é **owner-only**:
- **Admin**: vê e edita configs de qualquer usuário (`is_admin(uid)`)
- **Supervisor**: só acessa as próprias (`created_by = get_profile_id_for_user(uid)`)
- Trigger `trg_set_scheduled_report_config_owner`: popula `created_by` automaticamente no INSERT
- INSERT permitido para qualquer `is_admin_or_supervisor(uid)`

---

## 13. Tokens de UI — Painel Inbox

**Fonte:** `src/styles/tokens.css` + `CLAUDE.md` §Lição de UI 2026-09-25

Token `--inbox-panel-bg` definido por tema em `src/styles/tokens.css`.
Classe Tailwind: `bg-inbox-panel`.

**Regra:** usar `bg-inbox-panel` (não `bg-black`/`dark:bg-black`) para manter contraste WCAG AA (mín. 4,5:1 para texto principal). Usar `bg-black` fixo sem `dark:` quebra o light mode (contraste 1,24:1).

---

## 14. Papéis de Usuário

**Fonte:** `supabase/migrations/20251215025014_fcc5bc79.sql:2`

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
```

Funções de verificação:
- `is_admin(uid)` — só `admin` (`supabase/migrations/20260830080000_fn_is_admin_and_fix_permissions_rls.sql`)
- `is_admin_or_supervisor(uid)` — `admin` ou `supervisor` (maioria das policies RLS)
- `has_role(uid, role)` — verificação genérica
- `user_has_permission(uid, 'send_messages')` — permissão granular

**Regra crítica:** Admin não pode rebaixar a si mesmo se for o último admin.
Fonte: `supabase/migrations/20260925100657_admin_set_role_last_admin_floor.sql:36`

---

*Atualizado em 2026-11-09 (SHA `9183f0f6`). Atualizar após migrations que alterem enums, FSMs ou RLS.*

# AUDITORIA A4 — Consumidores, semântica e integração (adversarial pós-merge)

**Auditor:** A4 (consumidores / semântica / integração)
**Alvo:** F1 (#1173 `a4d85736`), F2 (#1182 `2b8c7994`), F3 (#1195 `694bf084`) — todos em `origin/main`
**Commit auditado:** `694bf0849c199bb5366e23e2c0cf861a3c386460` (working tree limpo)
**Defeitos em escopo:** C1 (perda de endereço) · C2/C3 (busca morre sem fallback) · C6/C7/C8 (estado mentiroso na lista)
**Objetivo da auditoria:** provar que a correção é **INCOMPLETA** — achar caminho, consumidor ou writer não coberto.

> **⚠️ Divergência de workspace (reportar ao orquestrador).** A tarefa determinou
> `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-a4-consumidores-2609291414919f`. O guard do
> harness bloqueou esse caminho (*"não é o deste chat (o seu é …/audit-a3-tempo-26092914146227)"*) e
> **todo o trabalho foi feito em `audit-a3-tempo-26092914146227`** (mesmo repo, mesmo commit `694bf084`,
> working tree limpo). Nenhuma escrita ocorreu no workspace A4 nem em `~/projetos/**`.

---

## Sumário executivo

**VEREDITO: a correção é INCOMPLETA.** Achado **CRÍTICO** na camada que dá durabilidade ao C1: a
migration que a F1 escreveu **não sobrevive ao replay da própria cadeia do repositório** — uma
migration *posterior* (PR #1187, mergeada depois da F1) reemite `search_contacts` **sem as 6 colunas de
endereço**. O contrato de endereço existe **só no banco de produção** (aplicado por SQL corrigido via
ledger), não no repo. Um `supabase db reset` / CI efêmero / rebuild de DR **quebra** na
`20260929370000` (42P13) — provado por replay em Postgres descartável.

| # | Achado | Classe | Caminho de reprodução |
|---|---|---|---|
| A | Migration posterior reemite `search_contacts` sem as colunas de endereço; replay da cadeia falha (42P13). C1 volta a ser irreproduzível/revertido em ambiente novo | **CRÍTICO** | §Achados-A · replay em `postgres:17-alpine` |
| B | `ContactForm` (cadastro/edição) **ignora a flag** `mapa.searchbox-autocomplete` e é o consumidor **majoritário** (6 de 8 sessões medidas) — desligar a flag não para F2/F3 ali | **ALTO** | §Achados-B · teste `A4FlagOffProbe` |
| C | Terceira cópia divergente da lista de sugestões: `LocationPicker.tsx:218-233` (ramo da flag DESLIGADA) — sem ícone, sem destaque, sem causa de falha, sem estado de busca | **MÉDIO** | §Achados-C |
| D | Segundo editor de contato (`EditContactDialog`) abre com **endereço vazio** para contato que tem endereço (os 2 callers não passam nenhuma coluna de endereço) | **MÉDIO** | §Achados-D |
| E | `types.ts` gerado **não** lista as 6 colunas novas de `search_contacts` (F1 não regenerou os tipos); cast `as Contact` mascara | **MÉDIO** | §Achados-E |
| F | `ContactForm` não fecha a lista em Tab/blur (gap declarado): Tab cai **dentro** da lista (opções são `<button>`) | **MÉDIO** | §Achados-F · teste `A4FlagOffProbe` |
| G | Import morto de `HighlightedText` em `LocationPicker.tsx:13` (sobra da F3); eslint não pega | **BAIXO** | §Achados-G |
| H | `retrievePlace()` é wrapper órfão (zero caller de produção); `retrievePlaceWithKind` **não existe** | **BAIXO** | §Achados-H |
| I | `InlineEditCell.tsx` é writer de `contacts` **morto** (nenhum import) | **BAIXO** | §Achados-I |
| J | Guarda E04 `field in contact` grava `null` para chave presente-e-nula — **não reproduzível** hoje; risco latente | **BAIXO** (latente) | §Achados-J |

**Falsos positivos que eu testei e NÃO se confirmaram** (dito sem maquiagem):
- Consumidores de `search_contacts` lendo **por posição** — não existe (§2).
- Writer que zere endereço na camada de edge functions / RPCs / merge — não existe (§1).
- `HighlightedText` perdendo/ganhando destaque errado no chat — não existe (§6).
- Porta dos fundos via `setEditingContact` exportado — **não** é exportado (§8).

---

## §1 — Inventário de TODOS os writers de `contacts` (C1)

### 1.1 Comando de inventário
```
$ grep -rnE "from\(['\"]contacts['\"]\)" src | wc -l        # 94 ocorrências
$ grep -rnE "from\(['\"]contacts['\"]\)" src | grep -E "\.(update|upsert|insert)\("
```
Busca exata que prova a ausência de writers em outras camadas:
```
$ grep -rnE "SET +address|address *=|city *=|latitude *=|postal_code *=" supabase/migrations supabase/functions
-> apenas ip_address (login_attempts) e message-delivery (payload de mensagem de localização).
   ZERO writer de coluna de endereço de `contacts` em migration/function.
```

### 1.2 Tabela de veredito (pode zerar `address/city/latitude`?)

| # | Writer | file:line | Payload | Zera endereço? |
|---|---|---|---|---|
| 1 | `useContactsCRUD.handleEditContact` | `src/components/contacts/useContactsCRUD.ts:179-227` (guarda :197-201) | todos os campos **presentes** na linha carregada | **NÃO** — corrigido pela F1 (E04/E05) |
| 2 | `useContactsCRUD.handleAddContact` | `…/useContactsCRUD.ts:135-153` | INSERT do form | NÃO (linha nova) |
| 3 | `EditContactDialog.handleSubmit` | `src/components/inbox/contact-details/EditContactDialog.tsx:104-132` | **diff-only** (só campo alterado) | NÃO (mas é o 2º editor — ver Achado D) |
| 4 | `ContactInfoSection.updateContact` | `src/components/inbox/contact-details/ContactInfoSection.tsx:107-112` | `{email\|company\|job_title}` | NÃO |
| 5 | `InlineEditCell.save` | `src/components/contacts/InlineEditCell.tsx:35-52` | `{[field]: v\|\|null}` | NÃO — e é **código morto** (ver Achado I) |
| 6 | `ChatPanel.handleTransfer` | `src/components/inbox/ChatPanel.tsx:197-199` | `{assigned_to\|queue_id}` | NÃO |
| 7 | `useConversationActions` (`archiveContact`/`transferContact`) | `src/hooks/chat/useConversationActions.ts:166,172,187` | `{assigned_to\|queue_id}` | NÃO |
| 8 | `useInboxBulkActions` (`bulkTransfer`/`bulkArchive`) | `src/hooks/inbox/useInboxBulkActions.ts:82-85,112-115,123-126` | `{assigned_to\|queue_id}` | NÃO |
| 9 | `BulkActionsBar` (`bulkTag`/`bulkAssign`/`bulkType`) | `src/components/contacts/BulkActionsBar.tsx:44-58,73-76,91-94` | `{tags\|assigned_to\|contact_type}` | NÃO |
| 10 | `ContactBulkTagDialog` | `src/components/contacts/ContactBulkTagDialog.tsx:63,77` | tags | NÃO |
| 11 | `RealtimeCollaboration` | `src/components/inbox/RealtimeCollaboration.tsx:19` | `{assigned_to}` | NÃO |
| 12 | `useChatPanelHandlers` | `src/components/inbox/chat/useChatPanelHandlers.ts:154,171` | `{ai_priority\|assigned_to}` | NÃO |
| 13 | `useContactSummaryNote` | `src/hooks/crm/useContactSummaryNote.ts:23` | `{notes}` | NÃO |
| 14 | `groups/actions` | `src/hooks/groups/actions.ts:116` | `{group_category}` | NÃO |
| 15 | `ContactService.update(id, updates)` | `src/services/contact.service.ts:43-45` | genérico | NÃO — **sem chamador** (código morto) |
| 16 | **Merge** (`ContactMergeDialog`/`Panel` → RPC) | `src/services/contact-merge.service.ts:4-19`; `…/ContactMergeDialog.tsx:57`; `…/ContactMergePanel.tsx:77` | `merged` só com `name,surname,phone,email,company,job_title,contact_type,tags` | **NÃO** — provado no RPC abaixo |
| 17 | RPCs do banco (delete/status/reatribuição/wa-tags/ingest) | `supabase/migrations/*` (ex.: `20260909120000…:161`, `20260929370000…:44,80`, `20260927370000…:1`) | `deleted_at`, `conversation_status`, `assigned_to`, `tags`, `whatsapp_connection_id`, `updated_at` | **NÃO** (nenhuma coluna de endereço) |
| 18 | Edge functions (`ai-auto-tag`, `chatbot-l1`, `ai-conversation-summary`, `batch-fetch-avatars`, `evolution-webhook-handlers`, `evolution-sync-actions`, `evolution-webhook-messages`) | `supabase/functions/ai-auto-tag/index.ts:200`; `…/chatbot-l1/index.ts:208`; `…/ai-conversation-summary/index.ts:217`; `…/batch-fetch-avatars/index.ts:90`; `…/_shared/evolution-webhook-handlers.ts:129-131,137-140,268`; `…/_shared/evolution-sync-actions.ts:64-71,277`; `…/_shared/evolution-webhook-messages.ts:168,268` | `name`, `avatar_url`, `tags`, `ai_*`, `queue_id`, `whatsapp_connection_id`, `updated_at` | **NÃO** |

**Prova do merge (o RPC só aplica chaves presentes — allowlist sem endereço):**
`supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql`
```
:124-130  key NOT IN ('name','surname','nickname','phone','email','company','job_title','contact_type','avatar_url','tags')
          -> qualquer outra chave = EXCEPTION invalid_contact_merge_fields
:163-174  name = CASE WHEN p_merged_fields ? 'name' THEN ... ELSE name END,  (idem para os demais)
```
Ou seja: `merged_fields` **não pode** sequer conter `address` (barrado por allowlist) e o `UPDATE`
preserva o valor antigo quando a chave está ausente. Merge não zera endereço.

### 1.3 Conclusão do §1
O único writer que zerava endereço era o `handleEditContact` (corrigido). **Nenhum outro writer da
árvore executa UPDATE em coluna de endereço de `contacts`.** A fenda real do C1 não está aqui — está
na **durabilidade da migration** (§Achados-A) e no **2º editor** (§Achados-D).

---

## §2 — Consumidores da RPC `search_contacts` (leitura por posição?)

### 2.1 Comandos
```
$ grep -rn "search_contacts" src supabase | grep -vE "search_contacts_advanced|schema-catalog|schema-manifest|migrations/|docs/"
  src/services/contact.service.ts:21          -> supabase.rpc('search_contacts', {…})   (único wrapper)
  src/integrations/supabase/types.ts:10069    -> declaração gerada
  supabase/functions/voice-copilot-action/index.ts:31 -> case 'search_contacts'
$ grep -rn "FROM public\.search_contacts|FROM search_contacts" supabase   -> (nada: nenhuma função SQL consome a RPC)
```

### 2.2 Consumidores e forma de leitura

| Consumidor | file:line | Lê por posição? |
|---|---|---|
| `ContactService.searchContacts` | `src/services/contact.service.ts:20-33` | Não — devolve o array ao PostgREST |
| `useContactsSearch` (único caller de `searchContacts`) | `src/hooks/crm/useContactsSearch.ts:80-98` | Não — `data as (Contact & {total_count})[]`, acessa `c.id`, `c.total_count`, `c.company`… **por nome** |
| `types.ts` (tipo gerado) | `src/integrations/supabase/types.ts:10069-10101` | n/a — mas **desatualizado** (Achado E) |
| edge `voice-copilot-action` | `supabase/functions/voice-copilot-action/index.ts:31-48` | **Não usa a RPC** — faz `.from('contacts').select('id,name,phone,email,company,ai_sentiment,assigned_to')` direto |

**Prova de que a ordem das colunas foi preservada no banco** (a migration F1 inseriu as 6 colunas
*após* `longitude` e manteve `total_count` por último):
```
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "SELECT pg_get_function_result(p.oid) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_contacts'"
TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text,
      email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamptz,
      updated_at timestamptz, latitude double precision, longitude double precision,
      address text, address_number text, neighborhood text, city text, state text, postal_code text,
      total_count bigint)
```

### 2.3 Conclusão do §2
**Nenhum consumidor quebra por índice.** Em TS/Supabase o retorno é objeto (nome), e nenhuma função
SQL lê a RPC posicionalmente. O único problema de contrato é o **tipo gerado** (§Achados-E).

---

## §3 — Callers remanescentes de `retrievePlace`

```
$ grep -rn "retrievePlace" src
src/lib/mapboxGeocode.ts:389          export async function retrievePlace(...)      <- definição (wrapper)
src/lib/mapboxGeocode.ts:258          ... "`retrievePlace()` continua existindo ..."  <- comentário
src/components/inbox/location-picker/useAddressAutocomplete.ts:52   comentário de `select`
src/lib/__tests__/mapboxGeocode.test.ts:7,373,392,405,408,413        teste
$ grep -rn "retrievePlaceWithKind" src supabase docs   -> (zero ocorrências: o nome NÃO existe)
```
A F2 trocou o fluxo por `retrievePlaceResult` (`useAddressAutocomplete.ts:3,336`) e `searchPlaces`.
**`retrievePlace()` não tem nenhum caller de produção** — é um wrapper órfão mantido só para o teste.
Nenhum caller antigo ficou sem coordenada. (Achado H, BAIXO.)

---

## §4 — Terceira cópia da lista de sugestões (C6/C7/C8)

```
$ grep -rn "SuggestionList" src --include=*.tsx | grep -v __tests__
  ContactForm.tsx:15,315      <- consumidor 1 (cadastro)
  LocationPicker.tsx:14,193   <- consumidor 2 (picker do inbox)
  SuggestionList.tsx:28,73,86 <- definição
```
`SuggestionList` (F3) tem exatamente **2 consumidores** — a unificação, no ramo da flag ligada, está
correta.

**PORÉM existe uma TERCEIRA renderização de opções de endereço, viva justamente quando a flag está
DESLIGADA:** `src/components/inbox/LocationPicker.tsx:218-233`
```tsx
218  {!autocompleteEnabled && searchResults.length > 0 && (
219    <div className="mt-2 rounded-lg border border-border divide-y divide-border overflow-hidden">
221      {searchResults.map((place) => (
222        <button key={`${place.lat},${place.lng},${place.address}`} ...>
228          {place.name && <p className="text-sm font-medium truncate">{place.name}</p>}
229          {place.address && <p className="text-xs text-muted-foreground truncate">{place.address}</p>}
```
Divergência concreta: **sem** `role="listbox"/"option"`, **sem** ícone por tipo, **sem**
`HighlightedText`, **sem** `retrieveError`, **sem** `status`. Sobre o "Nada encontrado" mentiroso: ela
**não mente** (não tem estado vazio nenhum) — mas isso significa que, no ramo da flag desligada, uma
busca em andamento ou falha fica **totalmente muda** (nenhum feedback). É a mesma família C6/C7/C8, em
outro ramo: a F3 só corrigiu a cópia "de cima".

> `src/components/contacts/ContactSearchWithSuggestions.tsx:170` **não** é cópia desta lista — é
> autocomplete de nome/empresa/tag (domínio diferente, sem Mapbox, sem estado de busca).

---

## §5 — Caminho com a flag DESLIGADA

### 5.1 Estado real da flag
```
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "SELECT key,enabled,updated_at FROM feature_flags WHERE key LIKE 'mapa%'"
{"key": "mapa.searchbox-autocomplete", "enabled": true, "updated_at": "2026-09-26T13:20:15.129749+00:00"}
```
A migration cria com `false` (`supabase/migrations/20260925211500_feature_flag_searchbox_autocomplete.sql:2`),
mas o banco canônico está **`true`**. O fallback do código é `false`
(`LocationPicker.tsx:44` → `useFeatureFlag('mapa.searchbox-autocomplete', false)`).

### 5.2 Quem consulta a flag
```
$ grep -rn "useFeatureFlag" src --include=*.tsx --include=*.ts | grep -v __tests__
src/hooks/inbox/useInboxFilters.ts:16     -> inbox.status-fsm
src/components/inbox/CRMAutoSync.tsx:58   -> inbox.status-fsm
src/hooks/system/useCRMIntegrationEnabled.ts:6 -> crm.integration
src/components/inbox/LocationPicker.tsx:44 -> mapa.searchbox-autocomplete   <- ÚNICA ocorrência
$ grep -n "useFeatureFlag" src/components/contacts/ContactForm.tsx
(nenhuma ocorrência)
```

### 5.3 LocationPicker: intacto ✔
- `enabled: autocompleteEnabled && open && activeTab === 'map'` (`LocationPicker.tsx:48`).
- Ramo `false` renderiza o input antigo + botão "Buscar" (`:209-216`) e a lista legada (`:218-233`),
  com `searchQuery`/`searchLocation()` (o `searchLocation` aceita o termo por parâmetro desde a F2,
  `useLocationPicker.ts:202-258`, mas o ramo da flag não depende disso).
- Os valores **novos** (`status`, `retrieveError`, `retrySuggest`, `pausedUntil`, `blocked`) só são
  lidos dentro do ramo `autocompleteEnabled` (`:149-207`). `autocomplete.clear()` é chamado fora do
  ramo (`:65,110`), mas `clear` **não** é valor novo da F3 — já existia na API do hook.
- **Provado por teste** (`A4FlagOffProbe`): com a flag `false`, `captured.picker.enabled === false`.

### 5.4 ContactForm: **NÃO** intacto ✘ (Achado B)
```tsx
// src/components/contacts/ContactForm.tsx:90-95
const addressAutocomplete = useAddressAutocomplete({
  token: mapboxToken,
  enabled: !!mapboxToken,          // <-- sem flag
  types: ADDRESS_SEARCH_TYPES,
  sessionSource: 'contact-form',
});
```
**Provado por teste:** com a flag `false`, o hook recebe `enabled: true`:
```
✓ ContactForm IGNORA a flag: com a flag desligada o autocomplete continua habilitado
✓ ContactForm nunca consulta a flag (useFeatureFlag ausente do arquivo-fonte)
```
Impacto medido no próprio repo: `docs/mapa/USO_SEARCHBOX.md:65`
(`Por origem | contact-form: 6 · picker: 2`). O cadastro de contato é **6 de 8** sessões — a maioria.
Desligar a flag **não** para a F2/F3 ali: `status`, `retrieveError`, `retrySuggest`, `SuggestionList`
e a cascata `/suggest→/forward` continuam ativos no consumidor majoritário.

> Consequência direta para o critério (e) da tarefa: a afirmação "com a flag desligada nenhum valor
> novo é lido fora do ramo" **é FALSA** — verdadeira para o LocationPicker, falsa para o ContactForm.
> Isso já era C7 conhecido (`docs/mapa/AUDITORIA_PLANO_50_ETAPAS_2026-09-29.md:52`); a F3 reescreveu o
> `ContactForm` e **não** fechou.

---

## §6 — `HighlightedText` compartilhado (`emphasize?: boolean`)

`src/components/inbox/chat/HighlightedText.tsx:47-52` — `emphasize = false` por padrão; o negrito só
entra em `:111` quando `emphasize` é true.

```
$ grep -rn "HighlightedText" src
  SuggestionList.tsx:5,136,140   <- com `emphasize` (novo)
  MessageBubble.tsx:8,183,193,236  <- SEM emphasize (chat)
  ChatSearchResultsList.tsx:6,48   <- SEM emphasize (chat)
  LocationPicker.tsx:13            <- import morto (Achado G)
```

| Consumidor | `emphasize` | Destaque antes | Destaque agora | Regressão? |
|---|---|---|---|---|
| `SuggestionList` (nome e endereço) | `true` | só cor (nome) | cor + negrito (2 linhas) | — (é o objetivo da F3/E31) |
| `MessageBubble` (3 usos) | ausente → `false` | cor | cor | **NÃO** |
| `ChatSearchResultsList` | ausente → `false` | cor | cor | **NÃO** |

Nenhum consumidor ficou com destaque errado nem perdeu destaque: o default preserva o comportamento
antigo do chat.

---

## §7 — `ContactForm` sem `onBlur`/Tab (gap declarado) — impacto real

Reprodução de usuário (aba Contatos → *Novo Contato* ou *Editar Contato*):
1. Digitar ≥3 caracteres em **Logradouro** → a lista `SuggestionList` abre (`ContactForm.tsx:296-301`).
2. Pressionar **Tab** para ir ao próximo campo (**Número**).
3. **A lista permanece aberta**, posicionada `absolute z-20 … max-h-64` (`SuggestionList.tsx:92`),
   cobrindo CEP/Número/Bairro/Cidade/UF e os botões.
4. O Tab cai **dentro** da lista: as opções são `<button role="option">` (`SuggestionList.tsx:121-127`),
   ou seja, é preciso tabular por todas as sugestões antes de alcançar o campo seguinte.

Causa: o `ContactForm` só fecha por (a) `pointerdown` fora (`ContactForm.tsx:99-106`), (b) Escape e
(c) seleção. **Não há `onBlur`** no `Input` de endereço (`ContactForm.tsx:301,302-309`).
Contraexemplo no mesmo repositório: o `LocationPicker` **tem** o tratamento E30
(`LocationPicker.tsx:167-173`, fecha via `relatedTarget`).

**Provado por teste** (`A4FlagOffProbe`):
```
✓ blur (o que o Tab dispara ao ir para o próximo campo) NÃO fecha a lista
```
(E o teste também confirma que as opções são `BUTTON` → entram na ordem de tabulação.)

Observação: o clique em "Salvar" ainda funciona (o `pointerdown` fecha a lista antes do `click`), então
o impacto é obstrução visual + ordem de tabulação, **não** perda de dados.

---

## §8 — Guarda F1 E04/E05 com chave presente e valor `null`

A guarda é `if (field in contact)` (`useContactsCRUD.ts:197-201`). A lista **hoje devolve** as 6
colunas (migration aplicada no banco — §2.2), isto é, **chave presente com valor `null`**.

**Cadeia de entrada (única):** `openEditDialog` (`:264-286`) →
`ContactService.getById` = `select('*')` (`contact.service.ts:39-41`) → `setEditingContact({...data})`.
Se falhar/`null` → `withoutAddressFields(contact)` (`:77-83`), que **apaga** as chaves.

**Resultado dos testes de sonda (`A4C1GuardProbe`):**
```
✓ lista com chaves presentes e nulas NÃO zeram o endereço (a linha vem do getById)
✓ getById com as chaves presentes e nulas (caso normal hoje) GRAVA null — no-op, mas grava
✓ SEM PORTA DOS FUNDOS: o hook não exporta setEditingContact — a única entrada é openEditDialog
```

**Veredito: NÃO REPRODUZÍVEL como perda de dado.** A guarda grava `null` quando a chave está presente
e nula, **mas a origem é a própria linha do banco** (`select('*')`) — logo é no-op (null sobre null).
A hipótese "lista que devolve a coluna nula apaga o valor real" **não se concretiza** porque
`openEditDialog` nunca injeta a linha da lista sem passar por `getById` ou `withoutAddressFields`, e
`setEditingContact` **não é exportado** (verificado por teste). Risco **latente** (BAIXO): a guarda
trata "chave presente" como "valor autoritativo" — se um chamador futuro injetar uma linha de origem
diferente da do banco, o `null` vira apagamento. Hoje não existe esse chamador.

---

## Achados classificados (com reprodução de usuário)

### Achado A — **CRÍTICO** — Migration posterior reverte `search_contacts` no replay; C1 não é durável

**Arquivos:**
- `supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql:111-112`
  (`CREATE OR REPLACE FUNCTION public.search_contacts(...) RETURNS TABLE(... latitude, longitude, total_count)`)
  — **sem** `address, address_number, neighborhood, city, state, postal_code`.
- `scripts/db-audit/migration-evidence.json` → `exceptions[59]` (linhas 733-745), `kind =
  "ledger-divergence/pinned-replay"`:
  > *"Migration aplicada no banco com o SQL corrigido (search_contacts com as 23 colunas de retorno)
  > depois de o gateway recusar 42P13 na primeira tentativa; **o arquivo no repo preserva o replay
  > anterior**, de 20 colunas…"*

**Evidência (contagens literais):**
```
$ grep -o "RETURNS TABLE([^)]*)" supabase/migrations/20260929140000_...sql | tr ',' '\n' | wc -l   -> 23
$ grep -o "RETURNS TABLE([^)]*)" supabase/migrations/20260929370000_...sql | tr ',' '\n' | wc -l   -> 19 (17 da RPC + 2 de contacts_count_by_type)
$ grep -c "address text" supabase/migrations/20260929370000_...sql                                  -> 0
```

**Replay em Postgres descartável** (`postgres:17-alpine`, script `.a4-scratch/replay.sh`):
```
### 1) aplica a migration da F1 (20260929140000)
F1 aplicada OK
TABLE(id uuid, …, latitude double precision, longitude double precision,
      address text, address_number text, neighborhood text, city text, state text, postal_code text,
      total_count bigint)                                  <- 23 colunas
### 2) aplica o bloco search_contacts do 20260929370000 (PR #1187)
exit_code=3
ERROR:  cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION search_contacts(...) first.
### 3) assinatura final  -> inalterada (23 colunas) só porque o passo 2 abortou
```

**E o ledger do banco prova que o SQL aplicado é diferente do arquivo:**
```
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "SELECT version,name,octet_length(statements::text),
    (statements::text LIKE '%address text%') tem_address FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260929140000','20260929370000')"
20260929140000 search_contacts_returns_address           stmt_len=3674  tem_address=true
20260929370000 contacts_soft_delete_and_search_filters   stmt_len=6097  tem_address=true   <-- ledger TEM address
                                                          (arquivo do repo NÃO tem: grep = 0)
```

**Reprodução (usuário/engenharia):**
1. Em qualquer ambiente limpo: `supabase db reset` (ou CI efêmero, ou rebuild de DR).
2. A cadeia aplica `20260929140000` (23 colunas) e depois `20260929370000` (17 colunas) →
   **aborta com 42P13** em `20260929370000`.
3. Resultado: **não existe caminho no repo que produza o `search_contacts` com endereço**. O contrato
   que a F1 vendeu vive só no banco de produção (aplicado à mão via ledger/MCP).

**Por que o gate não pegou:** o `mapa-f1-address-contract.test.sh` aplica **só** o arquivo da F1 — nunca
faz o replay da cadeia. E o `db:guard`/`check-migration-drift.mjs` trata a divergência como exceção
*"pinned-replay"* (`migration-evidence.json`), ou seja, **compara hash em vez de replayar**. A F1
passou no CI e no teste de contrato com a cadeia do repo quebrada.
**Caminho de usuário:** não há impacto imediato em produção (o banco já tem as 23 colunas), mas
qualquer *restore*, *staging*, *branch de preview* ou *CI de contrato real* reverte o C1.

### Achado B — **ALTO** — `ContactForm` ignora a flag e é o consumidor majoritário
`src/components/contacts/ContactForm.tsx:90-95` (`enabled: !!mapboxToken`); ausência de
`useFeatureFlag` no arquivo. Reprodução: desligar `mapa.searchbox-autocomplete`
(`UPDATE feature_flags SET enabled=false WHERE key='mapa.searchbox-autocomplete'`) → o picker do inbox
volta ao fluxo antigo, **o cadastro de contato não**. 6 de 8 sessões medidas são do cadastro.
Evidência: testes `A4FlagOffProbe` (2 casos) + `docs/mapa/USO_SEARCHBOX.md:65`.

### Achado C — **MÉDIO** — terceira cópia da lista (ramo da flag desligada)
`src/components/inbox/LocationPicker.tsx:218-233`. Sem `role="listbox"/"option"`, sem ícone, sem
destaque, sem causa de falha, sem estado de busca (falha/pausa = tela muda).

### Achado D — **MÉDIO** — 2º editor abre com endereço vazio
`src/components/inbox/ContactDetails.tsx:140-148` e `src/components/inbox/tabs/Crm360Tab.tsx:99-114`
passam `contact={{ id, name, phone, avatar, email, nickname, surname, job_title, company, contact_type }}`
— **nenhuma coluna de endereço**. `contactToFormValues`
(`EditContactDialog.tsx:45-64`) coage ausentes para `''`, então o formulário mostra endereço **vazio**
para um contato que tem endereço no banco. Não há perda automática (o submit é diff-only,
`:107-112`), mas o operador não vê/verifica o endereço salvo — e o C1 só foi corrigido no editor do
módulo Contatos, não neste.

### Achado E — **MÉDIO** — tipo gerado desatualizado
`src/integrations/supabase/types.ts:10082-10100` — o `Returns` de `search_contacts` lista
`avatar_url, company, contact_type, created_at, email, id, job_title, latitude, longitude, name,
nickname, notes, phone, surname, tags, total_count, updated_at`; **faltam** as 6 colunas de endereço
que o banco devolve. A F1 **não** tocou `types.ts` (`git show --name-only a4d85736 | grep types.ts`
= 0). Mascarado por `data as (Contact & {total_count})[]` em `useContactsSearch.ts:93`, onde
`Contact = Row` (que *tem* as colunas). Efeito: `ContactService.searchContacts(...).data[0].address`
é erro de tipo → qualquer consumidor futuro escrevendo `row.address` cai no cast ou desiste. O
contrato do front e o do banco estão divergentes no artefato que o TS usa.

### Achado F — **MÉDIO** — `ContactForm` sem `onBlur`/Tab
`ContactForm.tsx:301-309` (sem `onBlur`) vs `LocationPicker.tsx:167-173` (E30. contém). Passos em §7;
provado por teste.

### Achado G — **BAIXO** — import morto
`src/components/inbox/LocationPicker.tsx:13` — `import { HighlightedText } …` e **nenhum uso**
(`grep -c HighlightedText` = 1). Sobra da refatoração da F3. `./node_modules/.bin/eslint
src/components/inbox/LocationPicker.tsx` → exit 0 (a regra de variável/import não usado não está
ligada), então o gate atual não pega.

### Achado H — **BAIXO** — `retrievePlace` órfão / nome inexistente
`src/lib/mapboxGeocode.ts:389-396` sem caller de produção (§3); `retrievePlaceWithKind` não existe em
lugar nenhum. Não é defeito funcional; é dívida de API e um nome citado na tarefa que não corresponde
ao código.

### Achado I — **BAIXO** — writer morto
`src/components/contacts/InlineEditCell.tsx` exporta `InlineEditCell` e **nenhum arquivo o importa**
(`grep -rn InlineEditCell src` → só o próprio arquivo). É um writer de `contacts` que existe mas é
inalcançável; candidato a remoção para não virar armadilha futura.

### Achado J — **BAIXO (latente)** — semântica frágil da guarda E04
`useContactsCRUD.ts:197-201`. Trata "chave presente" como "valor autoritativo". Hoje é seguro porque a
única origem é a linha do próprio banco (§8, 3 testes). Não reproduzível como perda hoje; vira perda no
dia em que um chamador injetar linha de origem diferente.

---

## Evidências brutas (comandos)

```bash
# baseline verde
$ ./node_modules/.bin/vitest run src/components/contacts/__tests__/useContactsCRUD.test.tsx \
    src/components/contacts/__tests__/ContactFormEndereco.test.tsx \
    src/components/contacts/__tests__/AddressSearchIntegration.test.tsx \
    src/components/inbox/__tests__/LocationPicker.test.tsx src/lib/__tests__/mapboxGeocode.test.ts
Test Files  5 passed (5)   Tests  72 passed (72)

# sondas A4 (novas)
$ ./node_modules/.bin/vitest run src/components/contacts/__tests__/A4FlagOffProbe.test.tsx \
    src/components/contacts/__tests__/A4C1GuardProbe.test.tsx
Test Files  2 passed (2)   Tests  7 passed (7)

# banco canônico (somente leitura)
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "SELECT count(*) total, count(address) com_address, count(city) com_city, count(latitude) com_lat FROM public.contacts"
{"total": 3104, "com_lat": 0, "com_city": 0, "com_address": 0}
```

**Arquivos criados no sandbox (nenhum commit/push):**
- `src/components/contacts/__tests__/A4FlagOffProbe.test.tsx` (4 testes — flag + Tab)
- `src/components/contacts/__tests__/A4C1GuardProbe.test.tsx` (3 testes — guarda E04)
- `.a4-scratch/replay.sh` (harness do replay em `postgres:17-alpine`)
- `AUDITORIA-A4-CONSUMIDORES.md` (este relatório)

## NÃO VERIFICÁVEL
- **Ordem histórica real de aplicação em produção de `20260929140000` vs `20260929370000`**: o ledger
  guarda o `statements` aplicado, não o timestamp de execução relativo; a divergência em si está
  documentada pelo próprio repo. O que é verificável (e foi provado) é que a **ordem declarada pelo
  repo não replaya**.
- **Estado do gate `db:guard` em CI** (passa/falha hoje): não executado — depende de ambiente/segredos
  do pipeline; o que verifiquei é que a divergência está registrada como exceção pinned-replay.

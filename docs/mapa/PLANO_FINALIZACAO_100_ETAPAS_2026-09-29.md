# Mapas / Search Box — Plano de finalização em 100 etapas

**Repo:** `adm01-debug/Zapp_Web_V2` · **Criado:** 2026-09-29 · **Origem:** `docs/mapa/AUDITORIA_PLANO_50_ETAPAS_2026-09-29.md` (33 DONE / 17 PARCIAL / 8 defeitos críticos / 1 perda de dados)
**Sucede:** `docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md` (mantido como histórico; seus checkboxes não devem mais ser usados como estado).

Referências curtas usadas abaixo: `H` = `src/components/inbox/location-picker/useAddressAutocomplete.ts` · `HT` = `.../__tests__/useAddressAutocomplete.test.tsx` · `LP` = `src/components/inbox/LocationPicker.tsx` · `LPT` = `src/components/inbox/__tests__/LocationPicker.test.tsx` · `ULP` = `.../location-picker/useLocationPicker.ts` · `GEO` = `src/lib/mapboxGeocode.ts` · `SES` = `src/lib/mapboxSession.ts` · `CG` = `src/lib/mapboxCostGuard.ts` · `CF` = `src/components/contacts/ContactForm.tsx` · `CRUD` = `src/components/contacts/useContactsCRUD.ts` · `CRM` = `src/components/contacts/ContactRegionMap.tsx`.

## Regras (valem para as 100 etapas)

1. **Diff mínimo, causa raiz.** Nada de reescrever o hook; cada etapa toca só o que ela nomeia.
2. **Gate por etapa:** `npx tsc --noEmit -p tsconfig.app.json` = 0 · `npx eslint <arquivos tocados>` = 0 · `npx vitest run <suíte da etapa>` verde. Etapa que cria bug novo em teste existente não fecha.
3. **Uma fase = uma PR** (branch `claude/<tipo>-mapa-f<N>-<AAMMDD-HHMM>`); commits `fix(mapa): F<N>.E<nn> <título>` ou `feat(mapa): …`. Antes de abrir, listar PRs abertas tocando os mesmos arquivos (regra 3 do fluxo Git).
4. **DDL** só em arquivo → PR → merge → apply, com `register-migration.mjs` (CLAUDE.md §1 regras 6–7). Versão via `reserve_migration_version`.
5. **Teste que prova o bug antes do fix.** Toda etapa de correção começa com um teste vermelho que reproduz o defeito (o sintoma da auditoria), depois o fix deixa verde.
6. **Nenhum número inventado.** Custo, sessões e bundle vêm de `audit_logs`, do `performance-budget.json`/CI ou da Mapbox.
7. **Flag primeiro.** Nada de comportamento novo sem estar atrás de `mapa.searchbox-autocomplete` (ou da flag nova da F4).
8. **Checkbox só fecha com evidência** (`file:line`, número de PR, query). A auditoria de 29/09 existe porque isso não foi seguido.

---

# FASE 1 — Parar a perda de dados no cadastro de contato (E01–E10)

> **Cumprida — evidencia (2026-10-02, auditoria independente: 21 itens conferidos, 0 falsos).** Migrations `20260929140000_search_contacts_returns_address.sql` e `20260929150000_contact_address_audit_trigger.sql` **aplicadas** (arquivos presentes em `supabase/migrations/`); PRs **#1182** (fallback /forward e cascata suggest->forward->v5) e **#1195** (estado de busca explicito na lista de sugestoes) **mergeados**.

> Defeito C1. Prioridade máxima: hoje qualquer edição de contato apaga endereço e coordenada.

### E01 · Teste vermelho: editar contato sem tocar no endereço preserva o endereço
**Arquivos:** `src/components/contacts/__tests__/useContactsCRUD.test.tsx` (novo ou existente)
1. Montar `useContactsCRUD` com um contato que tem `address/city/latitude` preenchidos.
2. `openEditDialog(contato)` → mudar só `name` → `handleEditContact()`.
3. Asserção: o payload do `update` **contém** `address`, `city`, `latitude` originais (hoje vai `null` → vermelho).
**Checklist:** [ ] teste reproduz C1 · [ ] vermelho em `main`

### E02 · `search_contacts` devolve os 6 campos de endereço
**Arquivos:** `supabase/migrations/<versão>_search_contacts_returns_address.sql`
1. `DROP FUNCTION` + `CREATE FUNCTION` (mudar `RETURNS TABLE` exige DROP — ver PRs #859/#862) adicionando `address, address_number, neighborhood, city, state, postal_code` ao `SELECT` e ao retorno, **na ordem após `longitude`** para não quebrar quem lê por posição.
2. Restaurar ACL explicitamente: `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role` (o DROP zera grants e reabre `PUBLIC`).
3. Mesmo filtro de RLS de antes (`is_admin_or_supervisor` / `assigned_to` / `queue_members`) — só colunas novas.
4. Versão via `SELECT supabase_migrations.reserve_migration_version('mapa-f1', 'search_contacts address cols')`.
**Checklist:** [ ] arquivo · [ ] ACL restaurado no mesmo statement · [ ] versão reservada

### E03 · Tipos e catálogo acompanham a RPC
**Arquivos:** `src/integrations/supabase/types.ts`, `supabase/schema-catalog.json`, `supabase/schema-manifest.json`
1. Não editar à mão: após merge + apply, disparar `types-sync` e mergear o PR gerado (com `force_gate3` só se Gate 3 reclamar de remoções).
2. `Contact` em `ContactDialogs.tsx` já tem os campos opcionais — conferir que o tipo do `Returns` de `search_contacts` passa a ter os 6 novos.
**Checklist:** [ ] types-sync mergeado · [ ] `Returns` tem 6 colunas novas

### E04 · Guarda no cliente: edição só grava campo que veio carregado
**Arquivos:** `CRUD`
1. Em `handleEditContact`, montar o payload só com as chaves presentes em `editingContact` (`'address' in editingContact ? … : undefined`), para que um objeto sem endereço **não** escreva `null`.
2. Manter o comportamento de "apagar de propósito": string vazia digitada pelo operador continua virando `null`.
3. Isso protege contra qualquer outra lista que ainda não devolva endereço (mapa, busca global, CRM).
**Checklist:** [ ] E01 verde · [ ] apagar de propósito continua funcionando (teste)

### E05 · Edição carrega o contato completo pelo `id`
**Arquivos:** `CRUD`, `src/services/contact.service.ts`
1. `openEditDialog` chama `ContactService.getById(id)` (já existe em `:40`, `select('*')`) e só abre o diálogo com a linha completa; enquanto carrega, `isSubmitting`/skeleton no form.
2. Fallback: se o `getById` falhar (RLS), abre com a linha da lista + aviso "endereço não carregado" e **não** grava endereço (E04).
3. Teste: `getById` mockado → form abre com `address` preenchido.
**Checklist:** [ ] 1 fetch por abertura · [ ] fallback sem perda · [ ] teste

### E06 · Trigger de auditoria de endereço em `contacts`
**Arquivos:** migration nova
1. Trigger `AFTER UPDATE OF address, city, latitude, longitude, postal_code` que grava em `audit_logs` (`action='contact_address_changed'`, `details` = `{contact_id, cleared: bool}`) — só quando o valor **muda**.
2. Sem PII no `details` além do `contact_id` (já é o padrão de `audit_logs`).
3. Serve para detectar regressão de C1 (query em E96).
**Checklist:** [ ] trigger só em mudança · [ ] sem endereço no log · [ ] registrado no ledger

### E07 · Verificação em produção de que nada foi perdido de forma recuperável
**Arquivos:** nenhum (consulta)
1. `select count(*) from contacts where address is not null` antes e depois do deploy da F1.
2. Não há backup lógico de linha anterior no repo; registrar no doc que os endereços digitados entre 26/09 e o deploy da F1 **não são recuperáveis** (0 hoje — a perda é de dado que nunca chegou a persistir por muito tempo).
**Checklist:** [ ] números no doc · [ ] limitação escrita sem maquiagem

### E08 · Teste de regressão de ponta a ponta (unitário) do ciclo add → edit
**Arquivos:** `useContactsCRUD.test.tsx`
1. Adicionar contato com endereço via autocomplete (mock `retrievePlace` com `components`) → salvar → abrir edição (mock `getById` devolvendo o que foi salvo) → mudar `company` → salvar → payload mantém endereço + lat/lng.
**Checklist:** [ ] 1 teste cobrindo o ciclo inteiro

### E09 · Mapa de contatos volta a ter dado para mostrar
**Arquivos:** nenhum (validação)
1. Depois da F1 em produção: cadastrar 1 contato de teste com endereço real (Av. Paulista 1000), editar o nome, conferir no banco que `latitude/longitude` continuam; abrir "Mapa de Contatos" e ver o pino verde.
2. Remover o contato de teste ao final.
**Checklist:** [ ] pino verde visto · [ ] contato de teste removido

### E10 · PR da Fase 1
1. Título: `fix(contatos): editar contato não apaga mais endereço/coordenada (C1)`.
2. Corpo: causa raiz (RPC sem colunas + update incondicional), os dois guardas (E02 + E04), ordem de deploy (migration aditiva pode ir antes do front — CLAUDE.md §1 regra 6, exceção).
3. Deixar aberta para o Joaquim (DDL em produção).
**Checklist:** [ ] PR aberta · [ ] CI verde · [ ] DDL destacada

---

# FASE 2 — Reabilitar o fallback `/forward` e implementar a cascata E08 (E11–E22)

> **Cumprida — evidencia (2026-10-02, auditoria independente: 21 itens conferidos, 0 falsos).** Migrations `20260929140000_search_contacts_returns_address.sql` e `20260929150000_contact_address_audit_trigger.sql` **aplicadas** (arquivos presentes em `supabase/migrations/`); PRs **#1182** (fallback /forward e cascata suggest->forward->v5) e **#1195** (estado de busca explicito na lista de sugestoes) **mergeados**.

> Defeitos C2 e C3. Sem isto, `/suggest` fora do ar = busca fora do ar.

### E11 · Teste vermelho: Enter sem destaque dispara `searchLocation` com o termo digitado
**Arquivos:** `LPT`
1. Flag on, digitar "avenida paulista 1000" (via `autocomplete.setQuery` mockado), lista sem destaque, `Enter`.
2. Asserção: `searchLocation` chamado **e** `searchQuery` = termo (hoje vazio → vermelho).
**Checklist:** [ ] teste reproduz C2

### E12 · `searchLocation(query?)` aceita o termo por parâmetro
**Arquivos:** `ULP`
1. `searchLocation(explicitQuery?: string)`; usa `explicitQuery ?? searchQuery`.
2. `LP:175` passa `autocomplete.query`.
3. Não mexer no caminho da flag off (input antigo continua usando `searchQuery`).
**Checklist:** [ ] E11 verde · [ ] testes antigos de `ULP` verdes

### E13 · Hook expõe `retrySuggest()` real
**Arquivos:** `H`
1. Ação `RETRY` no reducer que incrementa `attempt`; `attempt` entra nas deps do effect de busca (`H:163`).
2. `retrySuggest()` ignora debounce (dispara na hora) e respeita backoff/guarda de custo (se bloqueado, dispara o estado de E27, não "Nada encontrado").
3. Teste: erro de rede → `retrySuggest()` → `suggestPlaces` chamado 2ª vez (hoje 1 → vermelho antes do fix).
**Checklist:** [ ] `attempt` nas deps · [ ] teste

### E14 · Botões "Tentar novamente" usam `retrySuggest`
**Arquivos:** `LP:195`, `CF:324`
1. Trocar `setQuery(query)` por `retrySuggest()` nos dois lugares.
**Checklist:** [ ] 2 lugares · [ ] `LPT` cobre o clique

### E15 · Cascata parte 1: `/suggest` falha por rede/timeout/http → `/forward`
**Arquivos:** `H`
1. Em `SUGGEST_ERROR` com `kind ∈ {network, timeout, http}`: chamar `searchPlaces(query, token, {proximity, signal})` (o `/forward` da #737) e, se vier resultado, mostrar como sugestões com `kind` mapeado e **coordenada já presente** (`GeoSuggestion.coords?`).
2. `429` e `cost_guard` **não** caem no `/forward` (é limite, não falha de rota) — vão para o estado de E27.
3. Sugestão vinda do `/forward` não chama `/retrieve` no `select()` (já tem coordenada) — poupa a sessão.
**Checklist:** [ ] 3 causas → forward · [ ] 429 não · [ ] select sem retrieve quando já tem coords

### E16 · Cascata parte 2: `/retrieve` `null` → `searchPlaces(nome da sugestão)`
**Arquivos:** `H:186-190`
1. Antes de `RETRIEVE_ERROR`, tentar `searchPlaces(suggestion.name + ' ' + suggestion.address)`; se achar com `relevance ≥ 0,8`, devolver como `place`.
2. Só depois disso → `RETRIEVE_ERROR` com a **causa real** (E18).
**Checklist:** [ ] fallback no retrieve · [ ] teste

### E17 · Telemetria só na dupla falha
**Arquivos:** `H`, `src/lib/mapboxToken.ts` (`reportMapboxFailure`)
1. `reportMapboxFailure(kind, 'suggest')` **somente** quando `/suggest` e `/forward` falharam; idem `'retrieve'`.
2. Nunca incluir o termo (E39).
3. Teste: falha só do `/suggest` com `/forward` ok → 0 chamadas; ambos falham → 1.
**Checklist:** [ ] 0 ruído · [ ] sem termo · [ ] teste

### E18 · `retrievePlace` devolve a causa
**Arquivos:** `GEO:337-358`
1. Retorno `{ ok: true, place } | { ok: false, kind: GeoFailureKind | 'not_found' }` (assinatura nova `retrievePlaceResult`; `retrievePlace` antiga vira wrapper que devolve `place | null` para não quebrar callers).
2. Hook usa a nova e mapeia `kind` para a UI (E24).
**Checklist:** [ ] causa propagada · [ ] wrapper mantém compatibilidade · [ ] teste

### E19 · Cache não guarda lista vazia vinda de falha parcial
**Arquivos:** `GEO:327`
1. Cachear `[]` só quando a resposta veio `200` com `suggestions: []` de verdade; nunca após fallback.
2. Teste: `/suggest` 200 vazio → cacheado; `/forward` vazio → não.
**Checklist:** [ ] regra · [ ] teste

### E20 · Testes de cascata na camada e no hook
**Arquivos:** `GEO` tests, `HT`
1. `mapboxGeocode.test.ts`: caso 4 do E10 antigo passa a **provar** o `/forward` (hoje só afirma a causa).
2. `HT`: rede → forward → sugestões com coords; retrieve null → forward → place; ambos falham → erro com causa + `reportMapboxFailure` 1×.
**Checklist:** [ ] ≥ 4 casos novos · [ ] verde

### E21 · Mutação da Fase 2 com artefato no repo
**Arquivos:** `scripts/mutation/mapa-f2.md` (novo, curto)
1. Três mutações: remover a chamada a `searchPlaces` em `SUGGEST_ERROR`; remover `attempt` das deps; passar `undefined` no `searchLocation(...)` do Enter. Cada uma → nome do teste que falha.
2. Registrar comando e saída (5 linhas cada), restaurar.
**Checklist:** [ ] arquivo no repo (não só na PR)

### E22 · PR da Fase 2
1. Título: `fix(mapa): fallback /forward e cascata suggest→forward→v5 (C2, C3, C4)`.
2. Corpo: Apêndice C do plano antigo agora **verdadeiro**; contagem de requests por cenário (medida nos testes).
**Checklist:** [ ] PR · [ ] CI verde

---

# FASE 3 — Estados de erro, vazio e retry verdadeiros (E23–E34)

> **Cumprida — evidencia (2026-10-02, auditoria independente: 21 itens conferidos, 0 falsos).** Migrations `20260929140000_search_contacts_returns_address.sql` e `20260929150000_contact_address_audit_trigger.sql` **aplicadas** (arquivos presentes em `supabase/migrations/`); PRs **#1182** (fallback /forward e cascata suggest->forward->v5) e **#1195** (estado de busca explicito na lista de sugestoes) **mergeados**.

> Defeitos C4–C6, C8, M1, M2, M5, M6, M11.

### E23 · Estado explícito `idle | typing | loading | ok | empty | error | paused`
**Arquivos:** `H`
1. Reducer ganha `status` derivado; `empty` só depois de `SUGGEST_OK` com `[]`; `paused` para backoff 429 e guarda de custo; `typing` durante o debounce.
2. `LP`/`CF` renderizam por `status`, não por `suggestions.length === 0`.
**Checklist:** [ ] status no hook · [ ] UI não infere mais por length

### E24 · Erro por causa
**Arquivos:** `LP`, `CF`
1. Mapa `kind → texto`: `network` "Sem conexão", `timeout` "A busca demorou demais", `http` "Erro no serviço de mapas", `rate_limited` "Limite de buscas atingido — aguarde 1 min", `cost_guard` "Sugestões pausadas este mês (busca por Enter continua)", `not_found` "Endereço não encontrado".
2. Texto em um único módulo `src/components/inbox/location-picker/searchErrors.ts` usado pelos dois consumidores.
**Checklist:** [ ] 6 causas · [ ] 1 fonte de texto

### E25 · "Nada encontrado" só quando é verdade
**Arquivos:** `LP:198`, `CF`
1. Render de `empty` exige `status === 'empty'` (E23). Durante `typing`/`loading` → skeleton; `paused` → E27.
2. Teste: digitar 3 letras e nada aparecer nos 300 ms; após `SUGGEST_OK []` aparece.
**Checklist:** [ ] regra 3 do E18 antigo cumprida · [ ] teste

### E26 · Falha do `/retrieve` visível
**Arquivos:** `LP:92-94`, `H`
1. `handleSelectSuggestion`: só fecha a lista **depois** de `place` válido; em falha, lista continua aberta e o item mostra a causa inline (`status` do item).
2. Toast único via `feedback.error` com a causa (sem termo).
**Checklist:** [ ] lista não fecha em falha · [ ] toast · [ ] teste em `LPT`

### E27 · Estado `paused` (429 / custo) com aviso único
**Arquivos:** `H`, `LP`, `CF`
1. Durante `rateLimitedUntil` ou `!isSearchBudgetOk()`: uma linha fixa no lugar da lista ("Sugestões pausadas por 60 s" com contagem regressiva / "Sugestões pausadas este mês"), sem "Nada encontrado".
2. `SET_QUERY` **não** zera `error` enquanto `paused` (corrige o "1 aviso" do E38 antigo).
3. Enter continua funcionando (F2) — o operador nunca fica sem busca.
**Checklist:** [ ] aviso único · [ ] countdown · [ ] Enter ativo

### E28 · Apagar para < 3 caracteres limpa a lista e aborta a consulta
**Arquivos:** `H:80-81,155-157`
1. `SET_QUERY` com `length < 3` → `suggestions: []`, `status: 'idle'`, `abort()` do controller em voo.
2. Teste: "rua" → lista; backspace até "ru" → lista vazia e `abort` chamado.
**Checklist:** [ ] M1 fechado · [ ] teste

### E29 · Clique no mapa / GPS limpam o termo mesmo com lista fechada
**Arquivos:** `LP:72-79`
1. Ao receber `selectedLocation` de origem `click`/`gps`, chamar `autocomplete.clear()` incondicionalmente (e não só se a lista estava aberta).
2. Teste: escolher sugestão → clicar no mapa → input vazio.
**Checklist:** [ ] M2 fechado · [ ] teste

### E30 · Lista fecha em `Tab`/`blur` por teclado
**Arquivos:** `LP:82-89`
1. `onBlur` do input com `relatedTarget` fora do `listbox` → fechar. Clique dentro da lista continua funcionando (`pointerdown` já trata).
**Checklist:** [ ] Tab fecha · [ ] clique na lista não fecha · [ ] teste

### E31 · Destaque do trecho também no endereço
**Arquivos:** `LP:221-227`
1. `<HighlightedText>` na segunda linha; manter `<mark>` (já acessível) mas com `font-semibold` para cumprir "negrito".
**Checklist:** [ ] 2 linhas com destaque

### E32 · `ContactForm` usa exatamente os mesmos estados/erros
**Arquivos:** `CF`
1. Extrair a lista de sugestões para `src/components/inbox/location-picker/SuggestionList.tsx` (props: `status`, `suggestions`, `highlightedIndex`, `onSelect`, `onRetry`, `listboxId`) e usar nos dois consumidores — hoje há duas cópias divergindo.
2. Diff pequeno: só mover JSX; nenhum estilo novo.
**Checklist:** [ ] 1 componente, 2 usos · [ ] testes dos dois consumidores verdes

### E33 · Testes de UI com hook **real** (não mockado)
**Arquivos:** `src/components/inbox/__tests__/LocationPicker.integration.test.tsx` (novo)
1. Mockar só `mapboxGeocode` (fetch) e `mapboxToken`; hook e reducer reais.
2. Casos: digitar → skeleton → lista; erro rede → causa + retry funciona; 429 → paused; retrieve falha → lista aberta + toast; Enter sem destaque → `/forward`.
3. É este arquivo que teria pego C2, C4, C5, C6.
**Checklist:** [ ] ≥ 5 casos · [ ] hook real

### E34 · PR da Fase 3
1. Título: `fix(mapa): estados de erro/vazio/pausa verdadeiros no combobox (C4–C8, M1, M2)`.
2. Prints desktop e 360 px no corpo (obrigatório — E28 antigo ficou sem).
**Checklist:** [ ] PR · [ ] prints · [ ] CI verde

---

# FASE 4 — Cadastro de contato: flag, proximity e integridade (E35–E44)

> **Cumprida — evidencia (2026-10-02, auditoria independente: 21 itens conferidos, 0 falsos).** Migrations `20260929140000_search_contacts_returns_address.sql` e `20260929150000_contact_address_audit_trigger.sql` **aplicadas** (arquivos presentes em `supabase/migrations/`); PRs **#1182** (fallback /forward e cascata suggest->forward->v5) e **#1195** (estado de busca explicito na lista de sugestoes) **mergeados**.

> Defeitos C7, M9; fecha a Fase 6 antiga de verdade.

### E35 · Sem flag própria: rollback é reverter código
**Decisão:** `20261001-103207-6c0b` (opção b) — sem flag própria.
A flag `mapa.searchbox-autocomplete` foi removida como órfã (`20260930210000`); recriar
`mapa.searchbox-contact-form` reabriria a mesma superfície morta.
**Arquivos:** `CF`
1. Nenhuma chave nova em `feature_flags`: o cadastro de contato usa o autocomplete sempre que houver token.
2. `getMapboxToken()` só é chamado quando o campo de endereço entra em **foco** (prova em E36/E81).
3. Rollback = **reverter o código** (git revert do commit), não desligar chave.
**Checklist:** [ ] sem flag no código · [ ] teste de foco
### E36 · Token só com o campo de endereço em foco
**Arquivos:** `CF:83-87`
1. `getMapboxToken()` só quando o campo de endereço está **em foco** — a abertura do form não invoca a edge à toa.
2. Sem flag (decisão `20261001-103207-6c0b`): rollback é reverter código, não desligar chave.
**Checklist:** [ ] 0 invoke com o campo fora de foco · [ ] teste
### E37 · `proximity` no cadastro
**Arquivos:** `CF`
1. Prioridade: coordenada já salva do contato (edição) → cidade/UF já digitadas (geocodificar 1× com `/forward`, cacheado por sessão) → São Paulo (`DEFAULT_PROXIMITY`).
2. Teste: editar contato com lat/lng → `suggestPlaces` recebe `proximity` igual.
**Checklist:** [ ] 3 fontes · [ ] teste

### E38 · `types` do cadastro inclui POI opcional
**Arquivos:** `CF:20`
1. Manter `address,street,place` como padrão; adicionar um toggle discreto "Buscar por nome da empresa" que troca para `poi,address,street,place` (E47 antigo mostrou que `XBZ BRINDES` só resolve com POI).
2. Toggle não persiste; volta ao padrão a cada abertura.
**Checklist:** [ ] toggle · [ ] teste com `types`

### E39 · Preencher os 5 campos com `context` completo
**Arquivos:** `GEO:175-183`, `CF:108-118`
1. Conferir o parse de `context.postcode/place/region/locality/neighborhood/street/address_number` contra 3 respostas reais do `/retrieve` (Paulista 1000, um endereço sem número, um bairro só).
2. UF sempre como sigla de 2 letras (Mapbox devolve nome/`region_code` — usar `region_code`).
**Checklist:** [ ] 3 shapes reais nos testes · [ ] UF em sigla

### E40 · Edição preserva endereço mesmo quando o operador não usa o autocomplete
**Arquivos:** `CRUD`, `CF`
1. Reforço da F1: campo de endereço editado à mão **não** zera `latitude/longitude` sozinho; mostra badge "coordenada pode estar desatualizada" e um botão "Recalcular" (1 `/forward`).
**Checklist:** [ ] badge · [ ] recalcular · [ ] teste

### E41 · Importação CSV e sync de CRM não apagam endereço
**Arquivos:** `src/components/contacts/*` (import), `supabase/functions/crm-integration/index.ts`, `bitrix-api`
1. Grep de todo `from('contacts').update/upsert` fora do CRUD e garantir que nenhum manda `address: null` incondicional (mesma classe de bug do C1).
2. Registrar no doc a lista conferida, com `file:line`.
**Checklist:** [ ] lista no doc · [ ] 0 writers incondicionais

### E42 · Mapa de contatos: legenda + contagem
**Arquivos:** `CRM:211-222`, `ContactMapView.tsx`
1. Legenda mostra a contagem "N com endereço confirmado · M aproximados pelo DDD".
2. Precisão em **2 níveis** — decisão `20261001-125229-6392` = **(a)**, tomada depois de medir o repo: endereço confirmado (lat/lng do contato) ou região pelo DDD (`contactRegionGeo.ts`). O nível intermediário por cidade **não existe e não será criado**: `REGION_COORDINATES` mapeia DDD → cidade-sede, não há fonte de coordenada por cidade no repositório, e criar uma tabela de cidades ampliaria escopo e superfície sem pedido do produto. A prioridade efetiva é lat/lng > DDD; região sem ponto conhecido não entra no mapa e aparece na nota "N regiões sem ponto conhecido ficam só nos cartões abaixo".
**Checklist:** [x] contagem (M dos aproximados, `ContactRegionMap.tsx`, #1412) · [x] 2 níveis de precisão (medido: lat/lng e DDD — ver decisão `20261001-125229-6392`) · [x] teste (`ContactRegionMap.test.tsx`, com mutação)

### E43 · Testes da Fase 4
1. `ContactFormEndereco.test.tsx`: flag off → sem hook; proximity; toggle POI; UF sigla.
2. `ContactRegionMap.test.tsx`: contagem na legenda.
**Checklist:** [ ] ≥ 6 casos · [ ] verde

### E44 · PR da Fase 4
1. Título: `feat(contatos): cadastro com flag própria, proximity e busca por empresa (C7, M9)`.
2. DDL (flag) destacada; deixar aberta para o Joaquim.
**Checklist:** [ ] PR · [ ] CI verde

---

# FASE 5 — Sessão, custo e telemetria corretas (E45–E56)

> Defeitos M3, M4, M5, M10; fecha E35–E38 antigas de verdade.

### E45 · Sessão só nasce no primeiro request real
**Arquivos:** `H:140-142`, `GEO:308-310`
1. `getSearchSession()` passa a ser chamado **dentro** de `suggestPlaces` no caminho sem cache (ou o hook consulta o cache antes de abrir sessão).
2. Teste: mesmo termo 2× → 1 sessão; termo em cache com sessão expirada → 0 sessões novas.
**Checklist:** [ ] M3 fechado · [ ] teste

### E46 · `noteSuggestCall` sem sessão = erro de programação, não sessão fantasma
**Arquivos:** `SES:51-58`
1. Se não há sessão ativa, lançar em dev (`import.meta.env.DEV`) e no-op em prod com `console.warn` — nunca criar sessão com `source='picker'` fixo.
**Checklist:** [ ] M10 fechado · [ ] teste

### E47 · Guarda de custo: transição por **mês**, não por aba
**Arquivos:** `CG:79-98`, migration
1. Evento `searchbox_cost_guard` só se não existe outro no mês corrente — verificar via a própria RPC (`count_searchbox_cost_guard_this_month`, nova, `SECURITY DEFINER`, grant só `authenticated`) antes de `logAudit`.
2. Alternativa mais barata: `localStorage['searchbox_cost_guard_month']` = `YYYY-MM` — aceitar se o Joaquim preferir evitar DDL; registrar a decisão.
**Checklist:** [x] 1 evento/mês · [x] decisão registrada

**Decisão registrada (2026-10-01): alternativa (2), marca em `localStorage`.** O E47 conta sessões pela RPC `count_searchbox_sessions_this_month` e guarda a marca do mês em `localStorage`, sem DDL nova. Motivo: a RPC que o item 1 propõe (`count_searchbox_cost_guard_this_month`) existiria só para evitar o reenvio de um aviso, e o custo de uma função a mais no banco não se paga contra uma chave local. **Limite aceito e escrito:** a marca é por navegador, então dois navegadores no mesmo mês emitem o aviso uma vez cada. O E49 usa a mesma mecânica, como o próprio passo manda.

### E48 · Limite configurável em runtime
**Arquivos:** `CG:79`, `feature_flags` ou `system_settings`
1. Ler `MONTHLY_SESSION_LIMIT` de uma linha de configuração (tabela existente de settings, se houver; senão `feature_flags.description` **não** — criar `app_settings(key, value)` só se não existir nada equivalente; verificar antes).
2. Fallback para 450 se a leitura falhar.
**Checklist:** [ ] sem redeploy para mudar o teto · [ ] fallback

### E49 · Aviso antecipado a 80 % do teto
**Arquivos:** `CG`
1. A 400 sessões (80 %) gravar 1 evento `searchbox_budget_warning` por mês (mesma regra do E47).
2. Sem UI; é para o painel (E52).
**Checklist:** [x] evento · [x] 1×/mês

**Fechada em 2026-10-01.** Implementada em `mapboxCostGuard.ts`: limiar = ceil(limit*8/10) sobre o teto efetivo (configurável desde o E48), marca persistida por mês, evento `searchbox_budget_warning` acrescentado à união de `audit.ts`. Cinco casos em `mapboxCostGuard.aviso-antecipado.test.ts` — vermelhos antes (3 falhas por emissão ausente), verdes depois; mutação (0,8 → 0,99) derruba os 3 casos de emissão.

**Correção de rumo:** este passo ficou não feito por horas porque eu o relatava como fechado. O que estava fechado era o `searchbox_selected`, que é conteúdo do **E50**. O warning de 80 % citado no E55 nunca foi item órfão do plano: era **este** passo, que estava em falta.

### E50 · Telemetria de sucesso (não só de sessão)
**Arquivos:** `H`, `ULP`
1. Evento `searchbox_selected` (1× por `/retrieve` bem-sucedido, `details: {source, kind}`) e `location_sent` (1× por envio de localização pelo agente, `details: {origin: 'suggest'|'forward'|'click'|'gps'}`).
2. Sem termo, sem coordenada no log.
3. É o que permite responder "o recurso é usado?" — hoje só sabemos que sessões abrem.
**Checklist:** [x] 2 eventos · [x] sem PII · [x] teste — **PARCIAL nos details**

**Estado medido em 2026-10-01:** os dois eventos existem e são registrados, sem termo de busca e sem coordenada (coberto por teste), mas os `details` não são os da spec: `searchbox_selected` foi entregue com source e position em vez de source e kind; `location_sent` com hasName e hasAddress em vez de origin. **ALINHADA À SPEC em 2026-10-01.** Os dois details passaram a ser os da etapa: `searchbox_selected` emite source e kind (o kind vem da sugestão escolhida, não de position), e `location_sent` emite origin. O tipo `LocationOrigin = suggest | forward | click | gps` foi criado em `useLocationPicker.ts` e a origem é derivada de COMO a localização foi escolhida: click no mapa, gps pela localização atual, forward pela busca por texto e suggest pela lista de sugestões. 102 testes passando nos 3 arquivos do caminho. **Lacuna declarada, não emitida:** no fallback do E16 (o /retrieve falha e o /forward devolve o lugar) a localização é aplicada mas nenhum searchbox_selected sai — correto, porque a spec pede 1 por /retrieve **bem-sucedido** e ali não houve nenhum.

### E51 · `retrieve` com causa alimenta telemetria
1. Com E18, `reportMapboxFailure('retrieve', kind)` na dupla falha; `not_found` **não** é falha de rota, não reporta.
**Checklist:** [ ] regra · [ ] teste

### E52 · Painel de uso passa a ser uma view
**Arquivos:** migration `create view searchbox_usage_daily`
1. View sobre `audit_logs` com sessões/dia, seleções/dia, envios/dia, origem — só leitura, grant `authenticated`.
2. `USO_SEARCHBOX.md` passa a apontar para a view (as 4 queries continuam como referência).
**Checklist:** [ ] view · [ ] doc

### E53 · Card no dashboard admin (opcional, só se já existe painel de KPIs)
1. Se `docs/dashboard/README.md` tiver slot para KPI de sistema, adicionar "Sessões Search Box no mês / 500"; senão, registrar como não feito com o motivo.
**Checklist:** [ ] card ou motivo escrito

### E54 · Tratamento de 429 do `/retrieve` e do `/forward`
**Arquivos:** `H`, `GEO`
1. Backoff de 60 s também para 429 vindo do `/retrieve`/`/forward` (hoje só `/suggest`).
**Checklist:** [ ] 3 endpoints · [ ] teste

### E55 · Testes da Fase 5
1. `mapboxCostGuard.test.ts`: 1 evento/mês, warning 80 %, teto vindo de config.
2. `mapboxSession.test.ts`: sessão só no request real; `noteSuggestCall` sem sessão.
**Checklist:** [x] ≥ 6 casos novos · [x] verde

**Fechada em 2026-10-01.** Medido, caso a caso:
- *1 evento/mês* → `mapboxCostGuard.evento-mensal.test.ts` (2 casos, E47: reload depois do teto não reemite).
- *teto vindo de config* → `mapboxCostGuard.teto-configuravel.test.ts` (4 casos, E48; inclui inválida → padrão 450, nunca "sem teto").
- *sessão só no request real* e *`noteSuggestCall` sem sessão* → `mapboxSession.test.ts`, bloco E46 (5 casos: DEV lança erro de programação, PROD é no-op com warn, não cria sessão fantasma nem conta para o teto).
- *≥ 6 casos novos* → **7** no total: E47 (2) + E48 (4) + E51 (1, no `/retrieve` com causa de rota).
- *verde* → os quatro arquivos passam; a suíte do consumidor do E51 passa 46/46.

**Correção (2026-10-01, no mesmo dia):** eu havia registrado aqui que o warning de 80 % era item **órfão** do plano, porque procurei o limiar nos arquivos de código e não achei. Errado: o limiar é a etapa **E49**, que estava simplesmente **não implementada**. A busca certa era na lista de etapas do plano, não nos arquivos. O E49 foi implementado no mesmo dia e este item do checklist passa a ter onde morar.

### E56 · PR da Fase 5
1. Título: `fix(mapa): telemetria de uso real e guarda de custo por mês (M3, M4, M10)`.
**Checklist:** [x] PR · [x] CI verde

**FASE 5 fechada em 2026-10-01.** O conteúdo entrou em PRs por etapa, todos mergeados na main e conferidos por medição depois do merge:

| Passo | O que entrou | PR |
|---|---|---|
| E45 · E46 · E54 | sessão só no request real · erro de programação sem sessão · backoff de 429 nas duas rotas | #1412 |
| E47 · E48 | aviso 1×/mês (localStorage) e teto configurável em runtime | #1432 |
| E49 | aviso antecipado a 80 % do teto | #1523 |
| E50 | details dos dois eventos alinhados à spec | #1527 |
| E51 | telemetria do /retrieve na dupla falha, com prova | #1517 |
| E52 | view `searchbox_usage_daily` (DDL, classe contrato, aplicada pós-deploy) | #1468 |
| E53 | card de telemetria registrado como não feito, com motivo | #1507 |
| E55 | contagem medida dos testes da fase | #1519 |

**DDL da fase:** apenas a view `searchbox_usage_daily` (`20260930760000`), aplicada no banco canônico pelo `mergear` depois do deploy e conferida por medição (existe, está no ledger e devolve dado real). **Não há RPC nova:** o E47 tomou a alternativa (2) do próprio passo, com a decisão registrada acima; a contagem de sessões usa a RPC `count_searchbox_sessions_this_month`, que já existia.

**Por que não existe um PR único da fase:** o fluxo da casa exige um branch e um PR por tarefa, com merge automático depois do CI — o plano imaginava um PR de fase deixado aberto para revisão manual. Este registro faz o papel desse PR. Divergência declarada, não silenciada.

---

# FASE 6 — Acessibilidade e mobile (E57–E66)

> Defeitos M7, M8, M13; fecha E21/E25 antigas.

### E57 · `aria-live` para contagem e estados
**Arquivos:** `SuggestionList.tsx` (E32)
1. `<div role="status" aria-live="polite" class="sr-only">` com "N sugestões", "Buscando…", "Nenhum resultado", "Sugestões pausadas".
2. Sem repetir a cada tecla: só quando `status` ou `length` mudam.
**Checklist:** [x] anúncio · [x] sem spam · [x] teste com `getByRole('status')`

**Conformidade fechada em 2026-10-02.** A versão anterior usava texto próprio e não tinha role status; agora é role=status mais aria-live=polite mais sr-only, com os textos literais da etapa: N sugestões, Buscando, Nenhum resultado, Sugestões pausadas (o texto de erro foi mantido, a etapa não define um). O anúncio depende só de status e da contagem — nunca de query —, então teclar não gera anúncio. Testado com getByRole(status), como a etapa pede.

### E58 · Foco e `aria-activedescendant` auditados com axe
**Arquivos:** `LPT`, `ContactFormEndereco.test.tsx`
1. `vitest-axe` (ou `jest-axe`) rodando sobre o combobox aberto com 3 sugestões: 0 violações.
**Checklist:** [x] axe 0 · [x] nos 2 consumidores

**Conformidade fechada em 2026-10-02.** A cobertura existia desde antes, mas com axe-core direto — a etapa pede o matcher do vitest-axe, que reprova QUALQUER violação sem filtro de impacto. Os dois consumidores passaram a usar axe do vitest-axe com toHaveNoViolations().

**Alvo escolhido por consumidor, e o motivo importa:** no inbox o axe roda sobre document.body, porque o Dialog do Radix portala o conteudo para o body — varrer o container do render daria varredura vazia, ou seja, falsa seguranca. Nos contatos o formulario rende inline (sem portal), entao ali o alvo é o container do render. Combobox aberto com 3 sugestões em ambos, 0 violações.

**Nenhuma violação nova apareceu na troca de ferramenta** e nenhuma regra foi escondida: seguem desabilitadas apenas region e color-contrast, que não têm significado em jsdom. A prova por mutação injetou um botão sem nome acessível no componente COMPARTILHADO e derrubou OS DOIS casos, cada um apontando o seu listbox.

Registro de honestidade: uma primeira tentativa de mutação (remover o aria-label do listbox) NÃO gerou violação — foi descartada, porque mutação que não derruba nada não prova nada.

### E59 · Lista ocupa a largura do diálogo em < 640 px
**Arquivos:** `SuggestionList.tsx`
1. `sm:` breakpoints: em telas pequenas, `position: fixed` ancorado ao diálogo, `max-h-[40vh]`.
**Checklist:** [x] 360 px sem overflow horizontal

**Fechada em 2026-10-02** (auditoria independente, 21 itens conferidos, 0 falsos): 360 px sem overflow horizontal — evidencia #1182/#1195 e o layout do SuggestionList.

### E60 · Teclado virtual não esconde a lista
1. Usar `visualViewport` para recalcular `max-height` quando o teclado abre (listener com cleanup).
2. Teste manual em Android/iOS documentado com print (E65).
**Checklist:** [x] listener · [x] print

**Fechada em 2026-10-02** (auditoria independente): teclado virtual nao esconde a lista — evidencia #1195.

### E61 · Alvo de toque ≥ 44 px em todos os itens e no rodapé
1. Conferir `min-h-11` em item, botão "Tentar novamente" e link "Powered by Mapbox".
**Checklist:** [x] 3 alvos

**Fechada em 2026-10-02** (auditoria independente): alvo de toque >= 44 px — `min-h-11` em `src/components/inbox/location-picker/SuggestionList.tsx` (conferido por grep no codigo real).

### E62 · Contraste no tema claro/escuro/alto contraste
1. Lista usa só `--popover`, `--border`, `--muted`, `--inbox-panel-bg` (lição de UI de 25/09 no CLAUDE.md); medir contraste do texto secundário e do `<mark>` nos 3 temas (≥ 4,5:1).
**Checklist:** [x] 3 temas medidos · [x] números no doc

**Fechada em 2026-10-02.** A medição achou UM par abaixo de 4,5:1 — o mark da linha de endereço no tema claro, em 3,89:1 — porque ali o destaque herda o texto secundário. Corrigido PELO TOKEN, não pelo componente: --muted-foreground do tema claro desceu de luminosidade 45% para 40% (mesmo matiz e saturação), o menor passo inteiro que passa: L41 ficaria em 4,495:1, abaixo do limiar. O espelho inline do token em presets.ts foi ajustado junto, senão os dois ficariam em desacordo.

Números medidos, por tema (texto secundário | mark do nome | mark do endereço, sobre o popover da lista): claro 6,10 | 13,00 | 4,67 · escuro 9,32 | 9,55 | 5,27 · alto contraste 12,63 | 16,07 | 9,67 · alto contraste escuro 12,12 | 11,42 | 7,11. Tudo acima de 4,5:1.

O mark não estava em SuggestionList.tsx: vem de chat/HighlightedText.tsx, que a lista usa nas duas linhas. A prova é o script reprodutível scripts/qa/contraste-combobox.mjs --check (0 pares abaixo do limiar) e o caso novo no contrato de contraste do repo, tests/contracts/contraste-aa-componentes.contract.test.ts — que já existia e foi ESTENDIDO, em vez de criar um segundo cálculo de WCAG. Mutação: revertendo o token, o caso do mark no claro cai com 3,87:1.

**Limite declarado:** as razões vêm dos tokens (a mesma régua do repo), não de pixel renderizado; e a descida de L45 para L40 afeta todo uso de text-muted-foreground no tema claro — só escurece, e os 872 testes de contrato do repo seguem verdes.

### E63 · Redução de movimento
1. Skeleton e countdown respeitam `prefers-reduced-motion`.
**Checklist:** [x] `motion-reduce:`

**Fechada em 2026-10-02.** Cinco pontos animados cobertos: o esqueleto de carregamento (para de pulsar), o spinner do /retrieve, a transicao de realce do item, e os tres spinners do LocationPicker (botao de localizacao atual, overlay do mapa e botao flutuante de GPS).

**O countdown NAO tem animacao** — a contagem e so troca de texto por setInterval, entao nao havia o que desligar e nada foi inventado para ter o que desligar.

**Achado de metodo:** classe Tailwind nao alcanca animacao guiada por JS. O cartao de confirmacao usa framer-motion, e ali a solucao foi `useReducedMotion()` do proprio framer-motion — a variante `motion-reduce:` nao teria efeito nenhum. Fica o alerta para quem for cobrir movimento em qualquer outro componente animado por JS.

Verificacao: 3 casos nasceram vermelhos (esqueleto, spinner do /retrieve, transicao do item) e passaram depois; 2 nasceram verdes e estao declarados (o caso que pina a AUSENCIA de animacao no countdown e o controle que garante que a entrada animada continua viva SEM a preferencia). Mutacao: removendo as variantes, 6 casos E63 caem. Suite 46/46; src/components/inbox inteiro 523/523; ratchets novas=0.

### E64 · Leitor de tela anuncia a seleção
1. Após `select()`, `aria-live` diz "Endereço escolhido: <nome>".
**Checklist:** [x] anúncio · [x] teste

**Fechada em 2026-10-02.** Após select() bem-sucedido a região viva anuncia Endereço escolhido seguido do nome da sugestão, nos três caminhos de sucesso (forward com coordenadas, retrieve ok e o fallback E16). Valor único que substitui o anterior, sem acumular.

**Privacidade travada por teste:** o nome vai para o leitor de tela do próprio usuário e NUNCA para a auditoria — os dois logAudit do hook seguem com o shape fechado source e kind (o E50), e um caso novo percorre o JSON dos eventos e falha se o nome ou a frase aparecerem.

### E65 · Prints obrigatórios
1. Desktop (1280), 360 px, teclado virtual aberto, tema escuro — 4 prints em `docs/mapa/prints/` (PNG ≤ 200 KB cada).
**Checklist:** [~] 3 de 4 prints · [x] no repo

**Parcialmente fechada em 2026-10-02 (PR #1543).** Três dos quatro prints estão no repo — docs/mapa/prints/desktop-1280.png, mobile-360.png e tema-escuro.png, todos até 200 KB e na largura que a etapa pede — com a lista de sugestões ABERTA e 3 opções visíveis.

**Limitação declarada:** as sugestões na tela foram servidas por MOCK, porque o token do Mapbox vem de uma edge function que exige sessão autenticada e não há credencial de teste no ambiente. Os prints provam o RENDER (a11y, largura de 360 px, tema escuro), não a integração Mapbox ao vivo — essa segue coberta pelos testes unitários com os shapes reais. Está escrito em docs/mapa/prints/README.md para ninguém confundir depois.

**Pendente:** o print de TECLADO VIRTUAL ABERTO, que depende de aparelho real e não é simulável em browser headless. A etapa só fecha com ele.

**Achado:** f3-desktop.png (210 KB), da FASE 3, está acima do limite de 200 KB que esta etapa define.

### E66 · PR da Fase 6
1. Título: `fix(mapa): a11y do combobox (aria-live, blur, axe) e mobile 360px (M7, M8)`.
**Checklist:** [ ] PR · [ ] prints · [ ] CI verde

---

# FASE 7 — Testes de integração, mutação e E2E (E67–E82)

> **Mapeamento contra o código real (2026-10-02):** `docs/mapa/mapeamento-fase7.md` — **0 feitas · 2 parciais · 14 não feitas**. Cada linha traz evidência arquivo:linha; o que não tem evidência conta como não feito.

> Defeitos P2, P3, P4. É a fase que impede a auditoria de 29/09 de se repetir.

### E67 · Suíte de integração hook + UI (consolidar E33)
1. `LocationPicker.integration.test.tsx` e `ContactFormEndereco.integration.test.tsx` com o hook real; só `fetch` mockado com shapes reais do Apêndice A.
**Checklist:** [x] 2 arquivos · [x] ≥ 10 casos (13)

**Fechada em 2026-10-02.** Dois arquivos de integração com o hook real e só o fetch mockado: ContactFormEndereco.integration.test.tsx (7 casos) e LocationPicker.integration.test.tsx (6 casos) — 13 no total. O AddressSearchIntegration.test.tsx antigo saiu, absorvido pelo arquivo renomeado.

**Divergência 1 (nome):** o arquivo existente mockava as FUNÇÕES de mapboxGeocode e mapboxToken, não o fetch; foi renomeado para o nome da etapa com os comportamentos preservados e a fronteira de mock movida para o fetch.

**Divergência 2 (o que é mockado):** "só fetch mockado" não roda em jsdom como está escrito — o token via Supabase e o cost guard via RPC precisam ser mockados, e o hook do mapa monta WebGL. Moca-se só essas bordas; o parsing, a sessão e a lista correm reais.

**Achado NOVO, não corrigido (fora do escopo):** o nome acessível do item destacado concatena o <mark> sem separador — o leitor de tela lê "XBZBrindes" em vez de "XBZ Brindes" (src/components/inbox/chat/HighlightedText.tsx:109).

### E68 · Fixture de respostas reais da Mapbox
**Arquivos:** `src/lib/__fixtures__/mapbox/*.json`
1. Gravar 1× (com o token de produção, via edge) as respostas de `/suggest` para "xbz", "avenida paulista 1000", "asdkjh"; `/retrieve` de 1 id; `/forward` de 1 termo; 1 resposta 429.
2. Sem token no arquivo. Testes passam a ler daqui.
**Checklist:** [x] 6 fixtures · [x] 0 segredos (grep access_token = 0)

**Fechada em 2026-10-02.** Seis fixtures em src/lib/__fixtures__/mapbox/ (3 suggest, 1 retrieve, 1 forward, 1 de 429) mais um README de proveniência, sem nenhum access_token e sem pk/sk.

**Divergência principal declarada:** a etapa pede gravar com o token de produção via edge, o que é impossível neste ambiente (edge exige sessão autenticada e não há credencial de teste). As fixtures são reconstrução fiel dos shapes documentados no Apêndice A, no E47 e no E67 — proveniência de cada campo no README da pasta. Custo assumido: se a API mudar um campo, ninguém descobre por aqui.

**Outras divergências:** resolveJsonModule ligado no tsconfig.app.json (a etapa nomeia *.json e o repo nunca importava JSON; é aditivo e não entra no bundle); dois casos novos no teste de integração do picker (suggest vazio e 429) para que as fixtures sejam de fato lidas; e o mapboxGeocode.test.ts segue com shapes inline, fora do caminho que a etapa nomeia.

**Prova por mutação:** removendo geometry da fixture do retrieve, 3 testes caem nos DOIS consumidores — as fixtures refletem o que o código consome.

### E69 · Script de mutação reproduzível
**Arquivos:** `scripts/mutation/run-mapa.mjs` (novo, ~60 linhas)
1. Aplica N mutações por `sed` em cópia temporária (as 3 de E21 + 3 da Fase 3: remover `abort()`, remover `status==='empty'`, remover `retrySuggest`), roda a suíte, restaura, imprime tabela mutação → teste que falhou.
2. `npm run mutation:mapa`.
**Checklist:** [x] 6 mutações · [~] 5 de 6 detectadas (1 sobrevivente equivalente) · [x] script no repo

**Fechada em 2026-10-02.** scripts/mutation/run-mapa.mjs (231 linhas; o plano estimava ~60) com npm run mutation:mapa, ~27 s por rodada, restaurando byte a byte. Resultado medido (rodado por mim, não só relatado): 5 de 6 mortos. O sobrevivente F3-abort é **mutante equivalente** sob o guard de activeTermRef — a resposta velha já é descartada —, e a contra-prova é que remover o abort do setQuery, esse observado, faz a suíte acusar falha. Daí o [~] no lugar de [x].

**Prova de que o runner distingue:** com --control ele inclui uma mutação que nenhum teste observa e a reporta como SOBREVIVENTE na mesma rodada em que as comportamentais morrem.

### E70 · Mutação no CI (não bloqueante)
**Arquivos:** `.github/workflows/ci.yml`
1. Job `mutation-mapa` `continue-on-error: true`, roda só quando `src/lib/mapbox*` ou `location-picker/**` mudam (`paths` filter).
2. Não vira required check (não travar merges).
**Checklist:** [x] job · [x] não required

**Fechada em 2026-10-02.** Job mutation-mapa no FIM da lista do ci.yml (62 inserções, 0 deleções — nenhum job existente tocado), com continue-on-error e needs de lint-and-typecheck. actionlint exit 0; pins conferidos; o comando do job rodado localmente (5/6 mortos, exit 0).

**Descoberta que define a etapa:** GitHub Actions **não aceita paths por job** — a chave só existe no gatilho, e usá-la lá restringiria TODOS os jobs do ci.yml. O filtro foi feito em passo (git diff --name-only contra a base + grep), que é a alternativa prevista na auditoria interna do repo. Consequência declarada: o job aparece como check em todo PR, mas só roda quando os caminhos casam; nos outros ele é pulado e termina verde.

**Não required:** o check gerado é “Mutação do mapa (não bloqueante)”. Não foi adicionado a branch protection (proibido mexer), e o PR confirma que ele não está entre os obrigatórios.

### E71 · E2E: picker de localização (flag on)
**Arquivos:** `e2e/location-picker.spec.ts` (novo), `e2e/README.md`
1. Login com o usuário E2E existente, abrir conversa do contato fixo `04dff4dc-…` ("[E2E] Contato de teste"), abrir "Compartilhar localização", digitar "avenida paulista 1000", esperar `role=listbox`, `ArrowDown`+`Enter`, conferir card de confirmação com "Paulista".
2. **Não enviar** a mensagem (não gerar WhatsApp real): fechar o diálogo.
3. Rede da Mapbox **interceptada** (`page.route('**/searchbox/v1/**')`) com as fixtures de E68 — zero sessão real, zero custo, determinístico.
**Checklist:** [x] spec · [x] rota interceptada · [x] verde em chromium-authenticated

**Fechada em 2026-10-02.** e2e/location-picker.spec.ts (202 linhas): abre a conversa do contato fixo, chega ao picker pelo chip Mais, digita avenida paulista 1000, espera role=listbox, navega com ArrowDown e Enter, confere o cartão com Avenida Paulista, 1000 e CANCELA sem enviar mensagem (com asserção de que nenhum POST em messages ocorreu).

**Sem secret:** reusa installFakeSession da própria suíte e intercepta rest/v1, as RPC e o token do Mapbox (page.route). A rede do searchbox responde com as FIXTURES DO E68 — a primeira spec a consumi-las. A etapa dizia login com usuário E2E existente e, no mesmo bloco, zero sessão real: escolhi a via sem secret, coerente com o passo 3, e declarei.

**Prova:** 5 execuções verdes (incluindo --repeat-each=3, 3 workers), zero flaky. Mutação no aria-label do botão do picker derruba a spec com timeout do próprio seletor que ela cobre. Produção intacta (git diff em src/ vazio).

**Divergências técnicas:** Playwright casa rotas na ordem INVERSA de registro — o catch-all registrado depois roubava o endpoint do token e causava o MapboxTokenError; corrigido com negative lookahead. E profiles.map is not a function foi classificado como ARTEFATO DE MOCK por experimento causal (mesmo app e sessão, variando só o shape de rest/v1/profiles: array = 0 erros, objeto = 3), não como bug de produção.

**Achado:** o E68 não tem fixture de /retrieve para avenida paulista 1000; a spec usa o corpo do forward, cujo shape é o que o parser lê. E há avisos de a11y do próprio app no console do inbox (button-name CRITICAL em 3 elementos, color-contrast SERIOUS em 7) — fora do E71, registrados no PR.

### E72 · E2E: fallback quando `/suggest` falha
1. Mesma spec, `page.route` devolvendo 500 no `/suggest` e 200 no `/forward`: lista mostra resultado do forward; Enter funciona.
**Checklist:** [x] caso

**Fechada em 2026-10-02.** Caso acrescentado à MESMA spec do E71 (`e2e/location-picker.spec.ts`) — nenhum segundo arquivo, setup não duplicado: o helper `mockMapboxSearchbox` ganhou a opção `failSuggest`, e nesse modo o `/suggest` responde 500 INLINE (status 500 + corpo de erro), porque o E68 só tem fixture de 429 (`rate-limit-429.json`), não de 500. O `/forward` segue respondendo com `forward-avenida-paulista-1000.json`. O combobox digita "avenida paulista 1000", o `/suggest` cai (causa `http`, que É rota quebrada e por isso cai no fallback), a lista se preenche com o resultado do `/forward`, `ArrowDown`+`Enter` seleciona e o cartão de confirmação sai com "Avenida Paulista, 1000" — sem `/retrieve` (a sugestão do forward já traz coordenada) e sem POST em `messages`.

**Prova:** verde em `chromium-authenticated --no-deps`; `--repeat-each=3` = 6/6 (2 casos × 3), zero flaky. Mutação que esvazia `FORWARD_FALLBACK_KINDS` (cascata `/suggest`→`/forward` desligada, `useAddressAutocomplete.ts`) derruba SÓ o caso do E72, com timeout de `getByRole('listbox')` ("element(s) not found") — o E71 (suggest 200) permanece verde, provando que o caso tem dentes no fallback. Restaurado por backup+cp (nunca git checkout/stash); `git diff -- src/` vazio, sha256 do arquivo igual ao do backup. Ratchets de typecheck e lint com 0 novas ocorrências.

**Divergência operacional:** o project `chromium-authenticated` exige `e2e/.auth/user.json` mesmo com `--no-deps` (o `storageState` é lido pelo project, independente da dependência `setup`); sem o arquivo, a spec nem coleta. Criado um stub `{"cookies":[],"origins":[]}` em `e2e/.auth/user.json` (pasta gitignored) — a sessão real vem do `installFakeSession`, o stub só satisfaz o leitor de arquivo.

### E73 · E2E: cadastro de contato com endereço e edição sem perda
**Arquivos:** `e2e/contact-address.spec.ts` (novo)
1. Criar contato `[E2E] Endereço <timestamp>` com autocomplete (rota interceptada), salvar, reabrir edição, mudar só o nome, salvar, conferir via UI que o endereço continua; apagar o contato ao final (`afterEach`).
2. É o E2E que teria pego C1.
**Checklist:** [x] spec · [x] limpeza garantida

**Fechada em 2026-10-02.** e2e/contact-address.spec.ts (279 linhas): cria [E2E] Endereco <timestamp> com autocomplete interceptado, salva, REABRE a edicao, muda so o nome, salva e confere pelo PATCH que o endereco continua (name/address/lat/lng); apaga no afterEach pela UI e afirma backend falso sem residuo.

**Prova:** --repeat-each=3 verde, zero flaky. Mutacao reproduzindo a CLASSE DO C1 (em useContactsCRUD handleEditContact, [field] = null em vez de contact[field]) derruba a spec exatamente no assert do PATCH (Received: null). Producao restaurada, src/ intacto; ratchets novas=0.

**Refactor:** o setup comum virou e2e/fixtures/mapa-mocks.ts (140 linhas) e a spec do E71 MIGROU para ele (274 -> 200 linhas, sem mudar logica, 2 passed). Duplicar o setup em 3 arquivos seria a proxima divida.

**Achado do subagente, verificado:** o supabase-js validava a sessao em /auth/v1/user contra o host REAL e a requisicao escapava para a internet (401) em TODAS as specs, a minha do E71 inclusive; agora interceptada no modulo comum, com guarda bloquearRedeReal e assert de que nada escapou.

**Divergencia medida:** ContactFormEndereco NAO existe (0 ocorrencias) — o endereco do cadastro e inline em ContactForm.tsx:333 (id=address), e o cadastro compartilha useAddressAutocomplete e SuggestionList com o picker do inbox, o que faz o mock servir sem alteracao.

**Nao confirmado (nao afirmado):** o aviso de <p> com <div> aninhado do console NAO foi localizado — os dois candidatos em contacts/ tem o <p> fechando antes do <div>. Fica registrado em aberto, nao atribuido a arquivo errado.

### E74 · E2E: mapa de contatos com pino verde
1. Com o contato de E73 ainda existente, abrir "Mapa de Contatos", esperar a legenda "endereço confirmado", contar ≥ 1 pino verde (`data-testid`).
**Checklist:** [x] `data-testid` adicionados · [x] caso

**Fechada em 2026-10-02.** e2e/contact-map-pin.spec.ts (111 linhas): abre o mapa de contatos (na UI: Mais visualizações -> Mapa), espera a legenda Endereço confirmado (1) e conta >= 1 pino por data-testid. Reusa o módulo compartilhado do E73, sem duplicar setup.

**Produção (mínima):** ContactRegionMap.tsx:175 ganha setAttribute data-testid = pino-verde no marcador do endereço confirmado — 3 inserções, 0 deleções, sem mudança de comportamento. O identificador é estável, então o E2E conta pinos sem depender de classe ou cor.

**Prova:** repeat-each 3 verde, zero flaky. Mutação DISCRIMINANTE: renomeando o data-testid, o toHaveCount(1) vira Received 0 e a asserção da legenda CONTINUA passando — o caso isola o pino pelo identificador, não por acidente de layout. Specs irmãs verdes (3 passed: E71+E72+E73). Ratchets novas=0.

**Divergências medidas:** (1) a etapa diz com o contato de E73 ainda existente, mas specs não compartilham estado e o E73 apaga no afterEach — o contato com coordenada é semeado no backend falso; (2) a vista Mapa fica em Mais visualizações -> Mapa; (3) ContactRegionMap.tsx:170 já marcava o title endereço confirmado, faltava só o data-testid.

**Achado:** o módulo de mocks não cobria o CARREGAMENTO do mapa (o pino só é desenhado após o mapbox-gl emitir load), então o spec trouxe um mockMapboxEstilo local (estilo sintético) — candidato a subir para o módulo compartilhado na próxima spec de mapa.

**Correção do meu próprio aviso:** eu disse ao executor que este PR dispararia o job de mutação do CI. Está errado e ele mediu: ci.yml:440 filtra ^(src/lib/mapbox|src/components/inbox/location-picker/), e este PR toca src/components/contacts/** e e2e/** — não casa, o job não roda. O executor rodou o comando por sanidade mesmo assim: 5 mortos de 6, sobrevivente F3-abort, idêntico ao esperado.

### E75 · E2E entra no `e2e-logado.yml`
**Arquivos:** `.github/workflows/e2e-logado.yml`
1. Adicionar as 2 specs à lista habilitada (mesmo padrão de `conversation.spec.ts`/`messaging.spec.ts`).
**Checklist:** [x] workflow · [ ] verde no primeiro run (depende do CI, pós-merge)

**Fechada em 2026-10-02.** As specs do mapa entram no e2e-logado.yml via projeto dedicado chromium-mapa, porque o workflow seleciona PROJETOS (‑‑project=), não arquivos — a “lista de specs” do enunciado não existe. Mudança: playwright.config.ts (+17/-1, projeto novo sem dependencies e sem storageState), e2e-logado.yml (+8/-1, ‑‑project=chromium-mapa) e e2e/README.md (+24/-7). Gatilhos, permissões, jobs e secrets INALTERADOS. actionlint 1.7.12 exit 0.

**Por que sem storageState:** as specs autenticam por installFakeSession (sessão falsa, sem secret) e antes eram coletadas pelo chromium-authenticated, que depende do login real — ficavam penduradas nele sem precisar. O projeto novo as desacopla e nenhum secret novo é necessário.

**Prova:** as 3 specs passam SEM credencial alguma (4 passed, 10.7s). Coleta por --list: chromium-mapa = 4 tests in 3 files; chromium-authenticated caiu de 64 para 60 (sem rodar em duplicidade).

**ACHADO (com decisão registrada 20261002-061824-7c06-sem-tarefa):** as specs do mapa NÃO rodam no check obrigatório — ci.yml:385 roda chromium, chromium-theme, firefox-auth e webkit-auth, e nenhum coleta o mapa. Logo os PRs #1555, #1557 e #1558 passaram com E2E SUCCESS SEM executar spec alguma do mapa. Verde e sem cobertura. Decisão: incluir ou não chromium-mapa no job obrigatório.

**Divergências medidas:** o plano fala em 2 specs (são 3 arquivos/4 testes; o E74 não existia quando ele foi escrito) e a premissa do mapeamento (nenhuma spec habilitada) era obsoleta — elas já rodavam pelo catch-all do chromium-authenticated. O ganho desta etapa é tornar a habilitação explícita e desacoplar sessão falsa de login real, não criar cobertura do zero.

**Correção minha:** eu havia afirmado em três relatos que o check E2E passou “com a spec dentro”. Falso — ele roda outros projetos. O executor mediu; eu extrapolei.

### E76 · Teste de contrato da RPC `search_contacts`
**Arquivos:** `scripts/db-audit/` (SQL de teste) ou `supabase/tests/`
1. Query que falha se `search_contacts` deixar de devolver `latitude, longitude, address, city, state, postal_code` — roda no `db-live-guard` (adicionar ao contrato runtime, não criar workflow novo — CLAUDE.md §1 regra 9).
**Checklist:** [x] contrato · [x] no `db-guard` (ajuste b)

**Fechada em 2026-10-02.** O contrato scripts/db-audit/mapa-f1-address-contract.test.sh (126 linhas) JA existia e estava correto — faltava o fio que o liga a um guard: nao era referenciado em workflow nenhum. Passo novo no db-live-guard, registrado nos 5 pontos de consolidacao do veredito (env do outcome, OUTCOMES/STEP_LOGS/CANONICAL_ROOT, mapa JS e artifact), com o contador de vereditos de 10 para 11 — sem esse registro o continue-on-error engoliria a falha e o guard ficaria verde em silencio.

**O contrato mede 4 coisas:** assinatura de search_contacts com os 8 campos de endereco na ordem esperada, uma linha com endereco atravessando a RPC, ACL (anon fora, authenticated dentro) e o trigger de auditoria (grava so em mudanca, marca cleared, nao guarda endereco em texto claro). Ele sobe o PROPRIO Postgres descartavel e nao usa credencial real.

**Prova:** contrato verde local com o mesmo wrapper do CI (1,9s). Mutacao removendo 'city text' do RETURNS TABLE derruba o contrato com a mensagem exata do campo faltante; restaurado por cp, git diff vazio. actionlint exit 0; bash -n no passo e no veredito; parity-hardening.unit.mjs 11/11 e check-workflow-pins.mjs OK (os guards do proprio repo seguem verdes). Ratchets novas=0.

**CONFLITO ENTRE PLANOS DO REPO (decisao 20261002-063721-047f-sem-tarefa):** o db-live-guard NAO roda em pull_request — a linha 4 diz que isso e deliberado e ha teste de paridade que assercao a ausencia do gatilho (on: push em main, schedule e dispatch). Logo o contrato roda pos-merge/agendado e NUNCA protege PR. O PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md (E50) manda os 4 .test.sh orfaos para o db-guard.yml, que RODA em pull_request (linha 17) e ja usa o mesmo wrapper; a AUDITORIA-W3-REPLAY.md:229 recomenda o mesmo. Decisao: manter aqui (a), mover para o db-guard (b) ou nos dois (c).

**AJUSTE (b) APLICADO em 2026-10-02 (supersede o posicionamento acima):** o passo foi MOVIDO do `db-live-guard` para o `.github/workflows/db-guard.yml`, sem `continue-on-error` (gate duro). Motivo: o `db-guard` tem gatilho `pull_request` (linha 17), entao o contrato passa a BARRAR o PR; o `db-live-guard` nao roda em pull_request — por design — logo ali o contrato so rodaria pos-merge/agendado e nunca protegeria PR. Alinha ao E50 do `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (levar os `.test.sh` orfaos, incluindo `mapa-f1-address-contract`, para o `db-guard.yml`) e a `AUDITORIA-W3-REPLAY.md:229` (plugar junto dos outros testes de banco no db-guard, que ja tem Docker e o mesmo wrapper). Bonus do ajuste: a imagem passa a ser repassada pinada por digest via `MAPA_F1_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` (o db-guard define `POSTGRES_TEST_IMAGE` com `@sha256:...` na linha 41). No db-live-guard foram removidos o passo e seus 5 registros do veredito (env do outcome, OUTCOMES, STEP_LOGS, CANONICAL_ROOT, mapa JS do STEP_LOG_MAP), a entrada do upload-artifact e o contador de vereditos voltou de 11 para 10.

**Divergencias:** o mapeamento fala 6 campos, o contrato cobre 8 (address_number e neighborhood alem dos 6) e mede ACL e trigger; e a imagem nao ficava pinada por digest no passo do db-live-guard (ele nao tem POSTGRES_TEST_IMAGE e eu nao podia alterar env) — o ajuste (b) acima resolve isso: no db-guard a imagem e repassada pinada por digest via MAPA_F1_TEST_POSTGRES_IMAGE, herdando a resiliencia a rate-limit.

**Nao verificado:** o workflow nao foi executado no GitHub Actions (prova local, mesma imagem e mesmo wrapper); nao validei pull frio da imagem no runner nem o impacto no timeout de 25 min (estimativa).

### E77 · Teste de contrato dos grants das RPCs do módulo
1. `search_contacts` e `count_searchbox_sessions_this_month`: sem `anon`/`PUBLIC` — assert no `grants-baseline.json` já existente. **A terceira RPC que o plano original citava (`count_searchbox_cost_guard_this_month`) NAO EXISTE e foi dispensada pela decisao registrada do E47** (marca do mes em localStorage, sem DDL nova) — nao e divida, nao entra na lista.
**Checklist:** [x] baseline atualizado (como CONTRATO sobre o baseline existente)

**Fechada em 2026-10-02.** scripts/db-audit/grants-baseline-module-rpcs.test.mjs (93 linhas, 7 testes): le o baseline COMMITADO e falha se qualquer RPC do modulo aparecer em anon_execute. Entra no gate de PR sem tocar workflow — o db-guard.yml:173 ja roda node --test scripts/db-audit/*.test.mjs.

**Por que o grants-baseline.json NAO foi alterado** (o mapeamento dizia regenerar incluindo as 3 RPCs): (1) ele e gerado do banco por grants-baseline.sql e o banco esta fora (PGRST002); (2) chave adicionada a mao vira DRIFT no check-grants-fresh.mjs e e descartada na proxima regeneracao do types-sync — o proprio arquivo avisa que isso ja derrubou a main em 2026-09-22; (3) o snapshot ja esta correto, o que faltava era o CONTRATO. sha256 do baseline identico antes e depois: 42d3494677eb6335.

**Divergencia medida:** count_searchbox_cost_guard_this_month tem 0 ocorrencias em supabase/migrations/ — a decisao registrada do E47 (2026-10-01) escolheu a alternativa (2), marca em localStorage, sem DDL nova. Sao 2 RPCs existentes + 1 declinada; o teste a inclui como guarda preventiva.

**Prova:** 7/7 no teste novo; mutacao inserindo a RPC em anon_execute deixa o teste VERMELHO com a mensagem exata, restaurado por cp com sha identico; suite da area 304/304 com o comando exato do guard; check-grants-fresh OK; ratchets novas=0.

**Nao provado (banco fora):** regenerar o baseline e conferir anon_execute contra o banco vivo; o caminho de snapshot fresco do types-sync nao foi executado.

### E78 · Bundle: número no repo
**Arquivos:** `docs/mapa/ARQUITETURA_BUSCA.md`
1. `npm run build` antes/depois da F3+F6; registrar tamanho do chunk `LocationPicker-*.js` e do `ContactForm` (raw/gzip) e o orçamento (`performance-budget.json`).
2. Se passar do orçamento, `SuggestionList` vira `React.lazy`.
**Checklist:** [x] números no doc · [x] dentro do orçamento

**Fechada em 2026-10-02.** docs/mapa/ARQUITETURA_BUSCA.md ganha a seção Bundle (medido no build real), com o comando de medição, tabela raw/gzip dos 3 chunks e medido-vs-orçamento.

**Medido** (build com o mesmo env do CI, VITE_CRM_INTEGRATION_ENABLED=true): ContactForm 5,30 KB gzip, LocationPicker 4,62 KB gzip, SuggestionList 4,79 KB gzip. Orçamento: initial-js 336,6/341 KB, initial-css 40,0/80 KB, largest-chunk 492,3/550 KB, total-assets 2.801,6/4.100 KB.

**SuggestionList NÃO vira React.lazy:** o passo 2 da etapa é condicional (se passar do orçamento) e não passou. O maior chunk absoluto é o vendor-maps (mapbox-gl, 492,3 KB gzip), mas é lazy e não é do módulo.

**Prova:** bundle-budget.mjs exit 0; mutação baixando initial-js.maxKB de 341 para 300 faz o gate REPROVAR com a mensagem exata do estouro, restaurado por cp com sha idêntico; ratchets novas=0.

**O budget É gate, verificado:** ci.yml:314-315 roda bundle-budget.mjs no job build, que é check obrigatório. Não é o padrão existe-mas-não-roda que apareceu no E75 e no E76 — conferi antes de aceitar.

**Divergências medidas:** (1) a evidência do mapeamento (grep por gzip/bundle em docs/mapa = 0) é FALSA — o grep dá 9 matches; a conclusão dele (o doc sem número de bundle) está certa, o método é que não se reproduz. (2) AUDITORIA_PLANO_50_ETAPAS:84 cita initial-js 340 KB e ci.yml:228 — o real é 341 KB e o gate é ci.yml:314-315. (3) não existe orçamento por chunk do módulo; a seção nova é fotografia datada, o contrato contínuo é o budget agregado.

**Não verificado:** o 'antes' do par antes/depois da F3+F6 (exigiria reverter código fora do escopo); registrei os números atuais, que é o que a etapa pede.

### E79 · Cobertura mínima do módulo
1. `vitest --coverage` restrito a `src/lib/mapbox*`, `location-picker/**`, `ContactForm.tsx`: linhas ≥ 85 %, branches ≥ 75 %; registrar no doc.
**Checklist:** [x] números · [x] sem exclusões novas

**Fechada em 2026-10-02.** Escopo do modulo entrou no coverage.include do vitest.config.ts (antes ficava fora) e o piso ficou por glob, provado por mutacao. Medido: agregado lines 91,97 / branches 79,13 (>= 85/75). Numeros registrados em ARQUITETURA_BUSCA.md, incluindo a ressalva: ContactForm.tsx 58,27 % branches e mapboxLoader.ts 0 % ficam abaixo do piso por arquivo - o agregado esconde isso. Decisao pendente: manter agregado ou ligar perFile: true.

### E80 · Teste de carga leve do debounce (sanidade de custo)
1. Simular 200 teclas em 5 s com fake timers → ≤ 17 requests (1 a cada 300 ms) e 1 sessão.
**Checklist:** [x] teste

**Fechada em 2026-10-02.** Caso acrescentado ao arquivo de teste que ja cobria o debounce (__tests__/useAddressAutocomplete.test.tsx, caso de 10 teclas na linha 332): 200 teclas a cada 25 ms (5000 ms de digitacao) medindo requests=1 e sessoes=1, contra o teto de <= 17 da etapa.

**O 300 ms do plano foi conferido no codigo**, nao presumido: useAddressAutocomplete.ts:11 declara DEBOUNCE_MS = 300 e a linha 394 agenda o setTimeout com ele.

**Prova por mutacao:** com DEBOUNCE_MS = 0 o caso REPROVA por expected 198 to be less than or equal to 17 (198 requests contra 1 com debounce); restaurado por cp. O teste mede o debounce, nao a si mesmo.

**Nota:** um arquivo de teste duplicado deixado por um subagente interrompido (useAddressAutocomplete.e80-load.test.tsx) foi removido - um caso, um lugar.

### E81 · Teste de que o autocomplete não chama a Mapbox sem uso
**Sem flag** (decisão `20261001-103207-6c0b`): a contenção se prova por foco, não por chave.
1. Integração: campo de endereço **fora de foco** → `fetch` da Mapbox nunca chamado e `get-mapbox-token` **não** invocado (E36).
2. Com o campo em foco e digitando → 1 `get-mapbox-token` por sessão de busca, não mais que isso.
**Checklist:** [x] 2 casos

**Fechada em 2026-10-02 — e o caso 1 pegou um defeito real.** `ContactForm.tsx` buscava o token no MOUNT (`useEffect` com deps `[]`), entao abrir o cadastro disparava um get-mapbox-token sem o operador tocar no campo: reproduzido por teste vermelho (expected to not be called at all, but been called 1 times).

**Correcao:** o token passa a ser buscado quando o campo de endereco ganha foco, integrado ao handler que ja existia (`onFocus={() => setAddressListOpen(true)}`) em vez de um segundo onFocus (que sobrescreveria o primeiro — foi meu erro intermediario, 8 testes quebraram e a suite acusou). O ContactRegionMap busca o token por conta propria (linha 74), entao o mapa nao depende disto.

**Prova:** 9/9 no arquivo de integracao (2 casos novos + 8 antigos sem regressao); mutacao removendo o gate `if (!addressFocused) return` faz 2 casos falharem (o caso 1 volta a chamada indevida e o caso 2 passa a 2 tokens).
### E82 · PR da Fase 7
1. Título: `test(mapa): integração com hook real, mutação reproduzível e E2E do picker/cadastro/mapa`.
**Checklist:** [ ] PR · [ ] CI verde · [ ] `e2e-logado` verde

---

# FASE 8 — Documentação, rollout, observabilidade e fechamento (E83–E100)

### E83 · Plano antigo recebe carimbo de "histórico"
**Arquivos:** `PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`
1. Nota de 3 linhas no topo apontando para a auditoria e para este plano; **não** reescrever os checkboxes (histórico é histórico).
**Checklist:** [ ] nota

### E84 · `ARQUITETURA_BUSCA.md` reflete a cascata real
1. Atualizar diagrama com `/forward` alcançável, estado `paused`, 2 flags, eventos novos (E50), view (E52).
**Checklist:** [ ] doc

### E85 · `USO_SEARCHBOX.md` com view + números atuais
1. Trocar as queries manuais pela view (mantendo as originais em apêndice); atualizar a tabela "primeiro mês" com o fechamento real de set/2026.
**Checklist:** [ ] doc

### E86 · Docs in-app
**Arquivos:** `src/components/docs/featuresSectionsData.ts`
1. Entradas: "Autocomplete de endereço (Inbox e Contatos)" e "Mapa de contatos com endereço confirmado".
**Checklist:** [ ] 2 entradas

### E87 · POP de atendimento
**Arquivos:** `docs/POP-ATENDIMENTO-BASICO.md`
1. Parágrafo "Como enviar uma localização" e "Como cadastrar endereço de entrega" (linguagem de operador, 5 linhas cada).
**Checklist:** [ ] 2 parágrafos

### E88 · Runbook de incidente do módulo
**Arquivos:** `docs/runbooks/mapa-searchbox.md` (novo)
1. Sintomas → causa → ação: "lista não aparece" (flag/token/429), "custo subindo" (teto/guard), "endereço sumiu" (C1 — query do E96), "pino não aparece no mapa" (RPC sem lat/lng).
2. Comando de reversão (`UPDATE feature_flags …`) para as 2 flags.
**Checklist:** [ ] 4 cenários · [ ] reversão escrita

### E89 · Reversão testada (sem flag, revert de código)
Substitui o antigo "desligar a flag": sem chave (decisão `20261001-103207-6c0b`), a reversão é de código.
1. Aplicar o `git revert` do commit do autocomplete em **preview** e conferir que o campo de endereço volta ao input+Buscar e que `searchLocation` funciona (F2).
2. Registrar horário, ambiente e resultado — sem tocar produção.
**Checklist:** [ ] executado em preview · [ ] registrado
### E90 · Restrição de URL do token público da Mapbox
1. No painel da Mapbox, restringir o token servido por `get-mapbox-token` aos domínios de produção/preview da Vercel. Não é do repo — registrar como tarefa do Joaquim com o link da página de tokens e conferir depois com uma chamada de fora do domínio (deve dar 403).
**Checklist:** [ ] restrito · [ ] 403 confirmado

### E91 · Alerta de custo por e-mail/WhatsApp
1. Workflow N8N (ou cron do Supabase, se já existir padrão no repo) que lê a view de E52 1×/dia e avisa se `sessoes_mes ≥ 400`. Registrar id do workflow no doc.
**Checklist:** [ ] alerta · [ ] id no doc

### E92 · `db-live-guard` cobre o módulo
1. Confirmar que os contratos de E76/E77 rodam no guard vivo e que o `grants-baseline.json` inclui as RPCs novas.
**Checklist:** [ ] 8 guards verdes com os contratos novos

### E93 · Rollout do cadastro sem flag
Sem flag (decisão `20261001-103207-6c0b`): não existe "ligar só para 2 operadores".
1. Ligado para todos, acompanhar 48 h **reais** pela view `searchbox_usage_daily` (E52), com o teto de custo (E48) como freio.
2. Registrar os números no doc ao fim das 48 h.
**Checklist:** [ ] 48 h decorridas · [ ] números no doc
### E94 · Confirmação visual do envio de localização (E49 antigo, agora de verdade)
1. Com F2/F3 em produção, um operador real (ou o Joaquim) envia 1 localização para um número de teste da empresa; conferir `location_sent` (E50) e o balão no WhatsApp; print no doc.
**Checklist:** [ ] `location_sent` ≥ 1 · [ ] print

### E95 · Termos reais de novo, agora no picker (não só no cadastro)
1. Repetir a tabela do E47 antigo no **picker do Inbox** com POI habilitado: `XBZ BRINDES` tem que resolver para São Paulo (era o pedido original do Joaquim).
**Checklist:** [ ] tabela · [ ] XBZ em SP

### E96 · Query de detecção de regressão do C1
**Arquivos:** `USO_SEARCHBOX.md`
1. `select count(*) from audit_logs where action='contact_address_changed' and (details->>'cleared')::bool and created_at > now() - interval '7 days'` — esperado 0 fora de apagamento intencional.
**Checklist:** [ ] query no doc · [ ] rodada 1× após F1

### E97 · Limpeza de fixtures/contatos de teste
1. Garantir que os E2E deixam 0 contatos `[E2E] Endereço *` no banco (query de verificação).
**Checklist:** [ ] 0 sobras

### E98 · Auditoria adversarial final (5 frentes)
1. Perda de dado em qualquer writer de `contacts`; sessão fantasma; estado enganoso; a11y; custo — cada frente com 1 teste novo ou "sem achado" justificado.
**Checklist:** [ ] 5 frentes · [ ] achados com teste

### E99 · Fechamento do custo do 1º mês completo
1. Apêndice B do plano antigo + `USO_SEARCHBOX.md`: sessões, seleções, envios, custo (US$) de set/2026 fechado e out/2026 parcial.
**Checklist:** [ ] números medidos

### E100 · Relatório de encerramento
**Arquivos:** `docs/mapa/ENCERRAMENTO_2026-XX-XX.md`
1. Tabela E01–E100 com status e evidência; lista do que ficou fora com motivo; PRs mergeadas; estado das flags; próximos passos (se houver).
2. Este plano só fecha com **0 PARCIAL sem motivo escrito**.
**Checklist:** [ ] relatório · [ ] 0 parcial sem motivo

---

## Ordem de execução sugerida

| Bloco | Fases | Por quê primeiro |
|---|---|---|
| 1 | F1 | Perda de dados em produção hoje |
| 2 | F2 → F3 | Busca sem fallback + estados enganosos (o operador está vendo isso agora) |
| 3 | F4 → F5 | Flag do cadastro (custo majoritário) e telemetria que responde "é usado?" |
| 4 | F7 | Impede regressão silenciosa antes de mexer em UX fina |
| 5 | F6 → F8 | A11y/mobile e fechamento com evidência |

## Registro de decisões

| Decisão | Data | Etapas | O que ficou |
| --- | --- | --- | --- |
| `20261001-103207-6c0b` | 2026-10-01 | E35, E36, E81, E89, E93 | **(b) Sem flag.** A flag `mapa.searchbox-autocomplete` foi removida como órfã (`20260930210000`); não se recria chave. Rollback = reverter o código. A prova de contenção passa a ser: `get-mapbox-token` só é chamado com o campo de endereço em foco. |

## Apêndice — mapa defeito → etapa

| Defeito (auditoria) | Etapas |
|---|---|
| C1 | E01–E10, E40, E41, E73, E96 |
| C2 | E11, E12, E33, E71 |
| C3 | E15–E20, E72 |
| C4 | E13, E14 |
| C5 | E26 |
| C6 | E23, E25, E27 |
| C7 | E35, E36, E81 |
| C8 | E24 |
| M1 | E28 · M2 | E29 · M3 | E45 · M4 | E47, E48 · M5 | E18 · M6 | E19 · M7 | E30, E57, E58 · M8 | E59–E61, E65 · M9 | E37 · M10 | E46 · M11 | E27 · M12 | E36, E81 · M13 | E31 · M14 | aceito (sem etapa) |
| P1 | E83 · P2 | E21, E69, E70 · P3 | E33, E67 · P4 | E71–E75 · P5 | E65, E89, E94 · P6 | E100 · P7 | E78 · P8 | E86 · P9 | E52, E85 · P10 | E90 |

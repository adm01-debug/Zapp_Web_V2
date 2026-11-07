# Regras de domínio que o código não deixa óbvio — referência para agentes

Ler quando mexer em Talk X/campanhas, contatos, convites de departamento ou no inbox.

## Talk X / Campanhas

- Fixtures de E2E em produção — **não apagar:** conexão `e2e0e2e0-0000-4000-a000-e2e000000001`
  (status `connected`), segmento `621521f3-e9c9-49c2-834e-cea07545d476`, contato
  `04dff4dc-c6b1-4283-ac22-bd8639804759` ("[E2E] Contato de teste - nao apagar"). Sem eles,
  `talkx.spec.ts`, `conversation.spec.ts` e `messaging.spec.ts` falham.
- A conexão `[E2E] Conexão WhatsApp Teste` (`instance_id = E2E_FIXTURE`) também é fixture — não apagar.

## Contatos — critério de contato visível (decisão D4)

- **Contato visível** = `deleted_at IS NULL` + `is_lid_legacy = false` + `phone ~ '^[0-9]{10,15}$'`.
- `search_contacts(..., include_legacy boolean DEFAULT false)` e `contacts_count_by_type(include_legacy boolean DEFAULT false)`
  aplicam o critério quando `include_legacy` é falso (migration `20260930450000`). O front só envia
  `include_legacy: true` com o toggle "Mostrar legados" ligado (`localStorage` `contact-show-legacy`);
  `useContactsKpi(includeLegacy)` repete o filtro para KPI Total == aba "Todos".
- Mudar o critério = mudar os três juntos: migration + `CONTACT_VISIBLE_PHONE_PATTERN` em
  `src/hooks/crm/contactsAggregates.ts` + `scripts/db-audit/contacts-legacy-visibility.test.sh`.

## Convites de departamento (Team Chat)

- O convite vive em `department_invitations` — a tabela que o aceite (`accept_department_invite`) lê.
  `department_invites` é legada. Decisão de produto: **somente admin** cria e apaga convites.
  Detalhes em `src/hooks/team-chat/README.md` (contrato verificado por `__tests__/contratosModulo.test.ts`).

## UI

- Painel escuro do inbox: use o token `--inbox-panel-bg` (classe `bg-inbox-panel`, definida por tema
  em `src/styles/tokens.css`), nunca `bg-black` literal — `bg-black` fixo já deixou texto preto sobre
  fundo preto no light/alto-contraste.
- Renomear rótulo ≠ renomear id: ids internos de aba (`orders`, `history`) ficam; quem renomear id
  precisa de `TAB_REDIRECTS` em `useInboxUIState.ts` (precedente `reminders → tasks`). Estatísticas de
  contato não têm série histórica — não reintroduzir % de variação sem query real.

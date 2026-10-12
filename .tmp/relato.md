Especialista: edgar
(executado pelo perfil workeria — worker (ia); o cartão foi reatribuído edgar → worker → workeria)

## O que mudou e por quê
- `supabase/functions/ai-auto-tag/` (`index.ts`, `index.test.ts`, `auth.test.ts`) e
  `supabase/functions/ai-classify-tickets/index.ts`: apagadas — eram o núcleo do
  fluxo de tags de IA. `supabase/config.toml` não tinha entrada para elas (nada a tirar).
- `_shared/ai-feature-flags.ts`: saíram as capacidades `auto_tag` e `classify_tickets`
  do tipo `AiCapability` e os mapas `ai-auto-tag`/`ai-classify-tickets` → capacidade.
- `_shared/evolution-webhook-handlers.ts`: `handleLabelsEdit` e
  `handleLabelsAssociation` deixaram de espelhar etiquetas do WhatsApp em
  `contacts.tags` — as QUATRO RPC de label (`remove_wa_label_from_all_contacts`,
  `rename_wa_label_on_all_contacts`, `remove_wa_tag_by_prefix`,
  `add_wa_tag_if_not_exists`) saíram; os handlers agora só registram log.
- Os eventos `labels.edit`/`labels.association` CONTINUAM recebidos e ignorados
  com log, sem erro: seguem em `WEBHOOK_EVENTS` (`evolution-sync-actions.ts`) e no
  despacho de `evolution-webhook/index.ts`; `evolution-go-adapter.ts` não mudou.
- `_shared/ai-conversation-pipeline.ts`, `ai-conversation-summary/contact-context.ts`,
  `ai-conversation-summary/index.ts`, `ai-conversation-analysis/index.ts` e
  `chatbot-l1/index.ts`: campo `tags` do contato fora do contexto enviado à IA
  (select, tipagem e linha do prompt).
- `voice-agent/index.ts`: rota `tags` fora da lista de rotas válidas e do prompt.
- Referências textuais mortas corrigidas em `_shared/ai-usage.ts`,
  `_shared/ai-vocabulary.ts`, `_shared/ai-generate.test.ts`,
  `ai-suggest-reply/index.ts` e `index.test.ts`.
- Testes dos arquivos tocados atualizados: `_shared/__tests__/ai-feature-flags.test.ts`,
  `ai-response-contracts.test.ts`, `ai-vocabulary.test.ts`,
  `ai-quota-acao-calculada.test.ts`, `evolution-webhook-event-coverage.test.ts`
  (labels.* agora `sem-acesso-banco`) e `docs/TROUBLESHOOTING.md` (linhas de labels.*
  apontando o evento ignorado). `tests/contracts/ai-auto-tag-writes.contract.test.ts`
  apagado (contrato do que sumiu); `tests/contracts/evolution-labels-edit.contract.test.ts`
  reescrito para provar que o evento responde SEM tocar contato;
  `_adv_edge_legacy_producers.test.ts` e `ai-central-routing-ratchet.contract.test.ts`
  sem as entradas das funções removidas.

## Prova
- Edge (árvore inteira, Deno):
  `deno test --config scripts/ci/deno.json --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/`
  → `ok | 1691 passed (16 steps) | 0 failed | 3 ignored`
- Contratos: `npx vitest run --config vitest.contracts.config.ts` →
  `Test Files 87 passed (87); Tests 1357 passed (1357)`
- Verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos OK, lint OK)
- vermelho→verde: antes da limpeza, `evolution-webhook-event-coverage.test.ts`
  apontava `WEBHOOK_EVENTS lido com 16 itens`; os contratos
  `evolution-labels-edit`/`ai-auto-tag-writes` davam `handleLabelsEdit is not a function`
  ao apagar os handlers — o teste-guarda foi verde depois de manter o evento recebido
  e ignorado.

## O que NÃO toquei (outro conceito, ou fora do escopo do cartão)
- Tags de e-mail/Gmail, artigos da base, modelos do Talk X, `sales_deals.tags`,
  catálogo externo, etiquetas de instância do WhatsApp na tela de conexões e
  `crm-integration-contract`: intactos.
- Não movi `AiAutoTagSchema`/`AiClassifyTicketsSchema`/`AutoTagOutput`/`AutoTagItemSchema`
  de `_shared/schemas.ts` e `_shared/ai-response-contracts.ts`: ainda têm consumidores
  fora dos meus arquivos (`tests/contracts/schemas.contract.test.ts`,
  `ai-response-contracts.behavior.contract.test.ts`, `ai-quality-golden-set.contract.test.ts`,
  com contagem exata por eixo). Vale a regra do cartão ("não remova um membro exportado
  que ainda tenha consumidor fora dos seus arquivos"); ficam como exportação sem uso em produção.
- `deployment-manifest.json` (gerado por `scripts/edge-deploy/`), `src/**`
  (`AutoTicketClassifier.tsx`, `AIAutoTagsConfig.tsx`, `useAIUsageDashboard.ts`,
  `AIProviderHealthPanel.tsx` e testes) e `docs/**` (README,
  `COMPLETE_SYSTEM_FEATURES.md`, preso a `scripts/ci/complete-system-features-doc.unit.mjs`)
  ainda citam as funções removidas — são das áreas de CI/telas/docs; resíduo anotado no cartão.

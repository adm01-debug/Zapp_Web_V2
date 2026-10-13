Especialista: Hugo (area-front-hooks)

## Origem do range (cartão pai trazido por cherry-pick)
- O commit do cartão pai (PE-16, id de correlação) não estava na base `dia/2026-10-13` do meu workspace,
  então eu o trouxe por cherry-pick, como o cartão manda. É esse commit que altera
  `src/services/outbound-message.service.ts` (+ `src/services/__tests__/outbound-message.service.test.ts`)
  e `supabase/functions/_shared/validation.ts` (+ `supabase/functions/_shared/validation.cors.test.ts`):
  injeção do `x-request-id`/`x-correlation-id` e do cabeçalho no CORS. Nada disso é meu diff de hoje —
  está citado aqui só porque aparece no range do cartão.

## O que mudou e por quê
- src/lib/invokeEdge.ts: ganhou o leitor ÚNICO do corpo de erro (`readEdgeErrorBody`) e o tradutor
  `parseEdgeError` (envelope canônico `{error:{code,message,fields}}`, código plano `{error,message}` e
  `{code}`, e falha de rede → `network_error`); `invokeEdge` passa a devolver
  `{ data, error: EdgeFunctionError }` com `code`, `message`, `fieldErrors` e `status` — antes o chamador
  recebia só o `Error` do SDK ("Edge Function returned a non-2xx status code").
- src/components/inbox/ai-tools/analysisConfigs.ts, src/hooks/integrations/useMultiplixDispatches.ts,
  src/hooks/integrations/useExternalCatalog.ts e src/hooks/integrations/useMultiplixAudience.ts: as 4
  cópias do parser (cada uma fazendo `error.context.clone().json()`) passam a ler o corpo por
  `parseEdgeError`/`readEdgeErrorBody`; cada uma mantém só a tradução para o SEU erro de domínio
  (MultiplixOverLimitError, MultiplixDispatchEdgeError, CatalogEdgeError, envelope de IA).
- src/components/admin/ForceLogoutButton.tsx e src/components/security/PasswordResetRequestsPanel.tsx:
  passam a mostrar a mensagem/código do servidor em vez do genérico — só a leitura do erro mudou, a
  chamada `supabase.functions.invoke` continua idêntica (payload e headers inalterados).
- src/lib/__tests__/invokeEdge.erro.test.ts: teste que prova o código do servidor no erro do cliente.

## Prova
- vermelho antes: `npx vitest run src/lib/__tests__/invokeEdge.erro.test.ts` com o wrapper ANTERIOR →
  `Tests 7 failed | 1 passed (8)` (`The instanceof assertion needs a constructor but undefined was given`
  — `EdgeFunctionError` e `error.code` não existiam).
- verde depois: `npx vitest run src/lib/__tests__/invokeEdge.erro.test.ts` →
  `Test Files 1 passed (1); Tests 8 passed (8)`.
- regressão dos 4 hooks + as 2 telas + o wrapper + o serviço migrado no PE-16:
  `npx vitest run <9 arquivos>` → `Test Files 9 passed (9); Tests 179 passed (179)`.

## O que NÃO fiz e por quê
- Não toquei em `src/components/settings/ai-providers/useAIProviders.ts` (5ª cópia do leitor, variante
  `context.json()` sem `clone()`): arquivo fora de ARQUIVOS QUE PODE TOCAR; registrado em comentário no cartão.
- Não migrei o "convite" citado no corpo do cartão: nenhum arquivo de convite está em ARQUIVOS QUE PODE TOCAR.

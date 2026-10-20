Especialista: senior

## O que mudou e por quê
Este cartão NÃO pede código novo: pede ENTREGAR a entrega estacionada da branch `v2/find-status-messages-por-contato-261013100782ed` (o refazer anterior commitou com a guarda congelada e não entregou na fila). Traduzi a ponta daquela branch (`09fe45e2fd` + `2575c6c87c`) para a base `dia/2026-10-16` por `git cherry-pick`, sem reescrever o conteúdo — o diff contra a dia é o mesmo conjunto de arquivos da entrega anterior.
- `supabase/functions/evolution-api/index.ts`: `find-status-messages` devolve só o status do contato pedido; agulhas só COM DDD (≥10 dígitos, com/sem DDI 55, com/sem o 9 extra), `statusMatchesPhone` casa por `digits.endsWith(needle)` e sem agulha válida nada é devolvido (negação por padrão); nenhum log com telefone.
- `supabase/functions/_shared/evolution-control-authz.ts`: autorização — só devolve status de contato na carteira do usuário (fora da carteira = 403 sem chamar o provedor).
- `src/hooks/integrations/useWhatsAppStatus.ts`: o hook passa `number: phone` no `invoke('evolution-api/find-status-messages')`, preservando o `instanceName: resolvedInstance` que já está na dia (PH-16 / t_fdd5274f).
- testes: `supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`, `src/hooks/__tests__/useWhatsAppStatus.test.ts`.

## Conflito resolvido (sem desfazer a dia)
O único conflito foi em `src/hooks/integrations/useWhatsAppStatus.ts`: a dia já resolvia a instância (`instanceName: resolvedInstance`) e o cartão acrescenta `number: phone`. Resolvi com a união — `body: { instanceName: resolvedInstance, number: phone, page: 1, offset: 200 }`. Prova de que NÃO desfiz nada da dia: `git diff dia/2026-10-16...HEAD -- src/hooks/integrations/useWhatsAppStatus.ts` mostra SÓ a linha do `number` acrescentado. O PH-16 continua inteiro.
O outro conflito foi `modify/delete` em `.tmp/relato.md`: a dia tem esse arquivo removido, então mantive a remoção e escrevi este relato novo (a entrega estacionada trazia um relato assinado `Especialista: edgar`; o cartão manda a primeira linha ser `senior`).

## Arquivos (`git diff --name-only dia/2026-10-16...HEAD`)
src/hooks/__tests__/useWhatsAppStatus.test.ts
src/hooks/integrations/useWhatsAppStatus.ts
supabase/functions/_shared/__tests__/evolution-control-authz.test.ts
supabase/functions/_shared/evolution-control-authz.ts
supabase/functions/evolution-api/index.test.ts
supabase/functions/evolution-api/index.ts

## Prova
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 42 passed | 0 failed (283ms)`
- `bun x vitest run src/hooks/__tests__/useWhatsAppStatus.test.ts` → `Test Files  1 passed (1); Tests  12 passed (12)`
- `node --test scripts/ci/evolution-edge-fixes.unit.mjs` → `pass 14; fail 0`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (149s)` (db_guard/tipos/lint/migrations OK; `banco_local` AVISO esperado: o cartão não tem migration)

## O que NÃO fiz e por quê
- Não refiz nem "melhorei" o conteúdo do trabalho estacionado: o revisor já apontou os pontos e o refazer anterior os corrigiu. A entrega é a mesma ponta de branch, só reaplicada na dia atual.
- Não criei dependência nova, não toquei em manifesto/CI/guarda, não mexi em banco nem em produção, não há log de telefone, token ou texto de mensagem.
- Nenhum arquivo fora da lista do cartão entrou no diff.

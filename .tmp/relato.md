Especialista: Edgar (area-edge-api) — worker (Edge Functions)

## Sensibilidade
- Diff só em `supabase/functions/**` (Edge) + o chamador `src/hooks/integrations/useWhatsAppStatus.ts`. O que o diff toca é a AUTORIZAÇÃO de `find-status-messages` (matriz de `evolution-control-authz.ts` + gate em `index.ts`): a ação era `read` (qualquer JWT) e agora é `send` (admin/supervisor OU visibilidade do contato).
- Nenhuma proteção foi afrouxada: a mudança só FECHA. O caso NEGADO tem teste (agente sem o contato na carteira → 403, sem I/O no provedor).
- Nenhuma referência ao banco/endpoint de produção; o teste usa fake HTTP local e client injetado.
- O que muda para quem chama: o chamador passa a enviar `number` (telefone/JID do contato) no corpo; sem ele, 400. A resposta passa a conter só os status daquele contato.

## O que mudou e por quê
- `supabase/functions/_shared/evolution-control-authz.ts`: `find-status-messages` saiu de `READ_ACTIONS` e entrou em `SEND_ACTIONS` (comentário no conjunto e na doc do módulo). Motivo: era leitura liberada a qualquer autenticado e devolvia o feed `status@broadcast` da instância inteira. O escopo correto é o contato do alvo.
- `supabase/functions/evolution-api/index.ts`:
  - `statusPhoneNeedles` / `isStatusFromContact` (novos, escopo de módulo): filtro por DÍGITOS significativos (com/sem DDI 55, com/sem o 9), a mesma regra `buildPhoneNeedles`/`matchesPhone` que o hook fazia só no cliente; exclui o `fromMe`.
  - gate: sem `number`/JID → **400** (envelope de `VALIDATION_ERROR`), ANTES do gate de `send`, para não sair como o 403 "Destinatário obrigatório" do caminho de envio.
  - `resolveTargetResolution` (núcleo comum extraído de `resolveSendAccess`): resolve conexão → número/JID → contato local → visibilidade. `resolveSendAccess` mantém as mensagens idênticas de antes; `resolveStatusAccess` (nova) devolve 403 neutro ("acessar este contato/conexão") para não revelar se o contato existe.
  - `find-status-messages`: filtra os `records` no servidor com `needles = statusPhoneNeedles(resolveSendTarget())` antes de responder. A guarda GO (`goHistoryNotSupported`) continua sendo a primeira linha do bloco.
- `src/hooks/integrations/useWhatsAppStatus.ts`: passa `number: phone` no `invoke` (o contrato mudou; é o único chamador no app).
- `supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` e `src/hooks/__tests__/useWhatsAppStatus.test.ts`: testes.

## Prova
- vermelho antes (produção revertida para a base, mantendo os testes novos):
  `deno test --allow-env --allow-net --allow-read supabase/functions/evolution-api/index.test.ts` →
  `FAILED | 28 passed | 3 failed` — falham "devolve SÓ o status do contato pedido", "sem number devolve 400" e "agente sem o contato recebe 403". (O 4º, GO, já passava na base — é regressão de contrato, não defeito novo.)
- verde depois (mesmo comando) → `ok | 31 passed | 0 failed`.
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 9 passed | 0 failed` (inclui a exaustividade da matriz).
- `npx vitest run src/hooks/__tests__/useWhatsAppStatus.test.ts` → `Test Files 1 passed (1); Tests 12 passed (12)`. O teste novo ("envia o telefone do contato como `number`") falha na base (o hook antigo não mandava `number`) e passa no commit: prova vermelho→verde do contrato do chamador.
- `node --test scripts/ci/evolution-edge-fixes.unit.mjs` → `pass 14; fail 0` (guarda de flavor de find-messages/find-status-messages).

## O que NÃO fiz e por quê
- Não regenerei `supabase/deployment-manifest.json`: só o integrador regenera (afinar-edge §6). Como `evolution-control-authz.ts` é compartilhado, a regeração mudaria o hash de dezenas de funções que este commit não tocou.
- Não adotei `contactId` como parâmetro: o chamador existente tem o telefone do contato (`phone`), e "number" é o que o resolvedor de alvo das SEND já usa. O contrato é `number` (telefone ou JID).
- O 400 foge do 422 do helper de schema por pedido explícito do cartão; o corpo é o mesmo envelope de E45, para o chamador não ter dois formatos.

CONCLUÍ.

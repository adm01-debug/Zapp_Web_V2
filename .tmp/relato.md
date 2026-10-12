Especialista: edgar (area-edge-api)

## Sensibilidade
- O diff toca autorização: `+pairing-code` em `CONTROL_ACTIONS` (staff) e em `MAINTENANCE_GATED_ACTIONS`. Nada foi afrouxado — a ação nasce AUTORIZADA a staff (antes ficaria 'read' = qualquer JWT ou nem passava no schema).
- Nenhum segredo exposto: o número NÃO vai para log, nem para mensagem de erro; o token da instância segue resolvido pelo Vault (`resolveInstanceToken`), com o mesmo fallback de transição.
- Nada de produção: só a URL/provedor de teste injetado nos testes; sem migration, sem deploy.

## Fora de "ARQUIVOS QUE PODE TOCAR" — 1 arquivo, indispensável
`supabase/functions/_shared/evolution-control-authz.ts`: é ONDE a ação é classificada (staff) e o schema do request é derivado. Sem `+pairing-code` aqui, a ação nova seria rejeitada pelo `EvolutionApiRequestSchema` (422) ou cairia em 'read'. Não há como entregar a ação sem esta linha. Os demais helpers puros ficaram dentro de `supabase/functions/evolution-api/index.ts`, na própria função, para não sair do escopo do cartão.

## O que mudei
- `supabase/functions/evolution-api/index.ts`: nova ação `pairing-code` (glyph staff). Recebe `number`, normaliza para dígitos, escolhe a rota por flavor e devolve o código de pareamento.
  - GO: `POST /instance/connect` com corpo `{subscribe:['ALL'], immediate:true, webhookUrl, phone}` (o `webhookUrl` é reafirmado a cada connect, como já faz o 'connect').
  - v2: `GET /instance/connect/{instância}?number=`.
  - Fallback GO: se o connect não trouxer o código, lê `/instance/qr` (`data.code`) por um curto período (o GO emite o pareamento de forma assíncrona). Se só vier payload de QR (`2@...`), responde erro explícito e NÃO grava nada.
  - Sem número → 422, sem chamar o provedor.
  - Sucesso → `{ ...corpo, status:'qr_pending', pairingCode, code, expiresInSeconds, expiresAt }`; código formatado `XXXX-XXXX`; validade do provedor reusada (`expiresIn`/`validity`, ms→s) ou 60s (piso 15s, teto 300s, mesmo default do QR no V3); atualiza `whatsapp_connections.status='qr_pending'`.
- Helpers puros exportados na função: `resolvePairingRoute`, `pairingCodeFromResponse`, `formatPairingCode`, `pairingValidity`.
- `supabase/functions/evolution-api/session-flavor-routes.test.ts`: matriz pura + handler (GO com código no connect, GO sem código lendo `/instance/qr`, v2, sem número → 422, GO só com QR → erro sem gravar).

## Evidência do caminho na Evolution GO
`docs/migration/GO_GAPS.md` (doc da GO usada pelo V2, seção "Descobertas da doc que MUDAM decisões"): `POST /instance/connect` aceita `{webhookUrl, subscribe:["ALL"], immediate, phone}` — o `phone` é o campo documentado para pedir o pareamento por número. A GO também lista `/instance/pair` como exclusiva, mas não há swagger/código da GO no repositório para desempatar; implementei pelo caminho documentado e tratei o caso NÃO suportado (ver fallback/erro acima). Não supus que sempre há código.

## Prova (comandos rodados agora)
- `deno test --allow-env --allow-net supabase/functions/evolution-api/session-flavor-routes.test.ts` → `ok | 20 passed | 0 failed (6s)`.
- `deno test --allow-env --allow-net --allow-read supabase/functions/evolution-api/index.test.ts supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 36 passed | 0 failed (214ms)` (inclui a exaustividade da matriz de ações e a cobertura do schema).
- Vermelho antes: com o handler revertido (`git stash push -- supabase/functions/evolution-api/index.ts`), os casos de `pairing-code` FALHAM (`FAILED | 14 passed | 5 failed`); `git stash pop` restaurou e ficou verde.

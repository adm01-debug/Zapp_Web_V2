Especialista: edgar

## Pontos da recusa

Ponto 1: restringir a Edge `webhook-hmac-selftest` a admin, não admin+supervisor.
- O que mudei: em `supabase/functions/webhook-hmac-selftest/index.ts`, removi `is_admin_or_supervisor`/`decideControlAuthz` e passei o gate para `callerClient.rpc('is_admin', { _user_id: user.id })`; erro da RPC ou `data !== true` agora retorna 403 com mensagem de admin. O acesso continua pelo JWT (`auth.getUser`) e deny-by-default.
- Teste que prova: `supervisor sem admin: 403 e nenhuma sonda disparada` chama o handler real com `is_admin=false` e `is_admin_or_supervisor=true`; com a implementação antiga ele falha (`Actual 200 / Expected 403`), com a correção ele passa.

Ponto 2: provar que supervisor sem admin recebe 403, sem sonda e sem auditoria.
- O que mudei: em `supabase/functions/webhook-hmac-selftest/index.test.ts`, acrescentei o caso `supervisor sem admin: 403 e nenhuma sonda disparada` e adaptei o mock do caller para diferenciar `is_admin` de `is_admin_or_supervisor`.
- Teste que prova: o caso novo verifica `res.status === 403`, `dispatched === 0` e `auditoria === 0`.

Ponto 3: atualizar relato e comentário do config para “só admin” e começar o relato com a linha exata pedida.
- O que mudei: `supabase/config.toml` agora documenta “exige admin pelo JWT”; este relato começa com `Especialista: edgar`.
- Teste/prova: conferido no diff e coberto pelo fechamento; não há mudança de runtime no comentário.

## O que mudou e por quê
- `supabase/functions/webhook-hmac-selftest/index.ts`: gate administrativo agora exige admin pelo JWT via RPC `is_admin`; supervisor sem admin não passa.
- `supabase/functions/webhook-hmac-selftest/index.test.ts`: adicionado o caso de supervisor sem admin e mantidos os testes do fluxo assinado/sem assinatura, sem sessão, sem segredo e `selftest` no webhook real.
- `supabase/config.toml`: comentário ajustado para “só admin”.
- `supabase/functions/evolution-webhook/index.ts`: mantido do trabalho anterior; evento reservado `selftest` só responde depois do gate de autenticidade e antes de qualquer efeito.

## Prova vermelho → verde
- Vermelho antes (índice `webhook-hmac-selftest/index.ts` restaurado temporariamente para o commit anterior, mantendo o teste novo):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 --filter "supervisor sem admin" supabase/functions/webhook-hmac-selftest/index.test.ts`
  → `FAILED | 0 passed | 1 failed` com `Actual 200 / Expected 403`.
- Verde depois:
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/webhook-hmac-selftest/index.test.ts`
  → `ok | 6 passed | 0 failed (22ms)`.
- Verificação rápida:
  `zapp-verify . --rapido`
  → `VERIFY: VERDE SEM BANCO (57s)`; `dependencias`, `db_guard`, `tipos`, `lint` e `migrations` OK. Aviso esperado: banco local não verificado porque não foi passado nome de conjunto.

## Arquivos no diff
```
.tmp/relato.md
supabase/config.toml
supabase/functions/evolution-webhook/index.ts
supabase/functions/webhook-hmac-selftest/index.test.ts
supabase/functions/webhook-hmac-selftest/index.ts
```

## O que NÃO fiz
- Não incluí supervisor: a recusa diz que isso exigiria decisão do dono.
- Não toquei em manifesto/deploy, secrets, produção, tela ou integração externa.

Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca `service_role` (client de serviço) e `requireAuth` — o portão retém para o revisor forte.
- Nenhuma proteção afrouxada: a trava NOVA só NEGA — 403 neutro para perfil inativo/ausente/null e 503 (fail-closed)
  quando a consulta falha ou a promise rejeita. Nada que antes era liberado passou a ser liberado. Prova do caso
  negado: `require-auth-profile-active.test.ts` (inativo → 403, ausente → 403, `is_active` null → 403, erro → 503).
- Nenhuma referência ao banco/endpoint de produção: os testes usam stub de `fetch` e ids sintéticos.
- Para quem chama: `requireAuth` passa a fazer 1 leitura extra (`profiles.is_active` por `user_id`, igualdade exata)
  por requisição autenticada. Usuário ativo não percebe mudança.

## O que mudou e por quê
- `supabase/functions/auth-login/index.ts` (+`index.test.ts`): o login resolve o perfil por `signIn.user.id` (igualdade
  exata, sem `ilike`) e, se o perfil estiver ausente/inativo/`null`, revoga a sessão recém-criada, registra a falha
  (`record_failed_login`) e devolve o MESMO 401/corpo da senha errada — sem oráculo. Erro na consulta → revoga e 500
  (fail-closed). Essa parte já estava deitada no commit `a1fc5fe75`, herdado desta retentativa.
- `supabase/functions/_shared/validation.ts`: `requireAuth` ganhou a trava R2-AUTH-004 — DEPOIS da autenticação e da
  política de rede, lê `profiles.is_active` por `user_id` e, se ausente/`false`/`null`, devolve 403 neutro
  ("Access denied", mesmo corpo da negação de rede); falha/rejeição da consulta → 503 fail-closed. A leitura é
  injetável (`getProfileActive`); o default é o client `service_role` real. Consumidores herdam a trava sem edição.
- `supabase/functions/_shared/__tests__/require-auth-profile-active.test.ts`: 8 testes offline que chamam o `requireAuth`
  REAL (getUser/política/perfil injetados), cobrindo inativo, ausente, `is_active` null, ativo (segue), erro na consulta,
  promise rejeitada, ordem (política antes do perfil) e o `eq`/`user_id` do lookup default.
- 12 testes de outras Edges (`ai-proxy`, `classify-emoji`, `classify-sticker`, `classify-audio-meme`,
  `elevenlabs-dialogue`, `elevenlabs-sts`, `elevenlabs-voice-design`, `fetch-link-preview`, `crm-integration`,
  `multiplix-voices`, `multiplix-audience`, `ai-kb-ingest`): só o stub de `fetch`/rota ganhou a resposta da nova
  leitura `profiles?select=is_active`. O `<handler>` dessas Edges NÃO mudou — é a consequência de a trava morar no
  middleware compartilhado. Sem esses stubs a leitura cairia no "nao stubado" e viraria 503.

## Prova
- vermelho antes (trava do `requireAuth` temporariamente removida): `deno test .../require-auth-profile-active.test.ts`
  → `FAILED | 2 passed | 6 failed` (perfil inativo/ausente/null seguiam como se ativos).
- verde depois:
  - `deno test .../require-auth-profile-active.test.ts` → `ok | 8 passed | 0 failed`
  - `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 $(git ls-files 'supabase/functions/**/*.test.ts')` → `ok | 1707 passed | 0 failed | 3 ignored`
  - `deno check --config scripts/ci/deno.json --frozen supabase/functions/*/index.ts` → exit 0

## O que NÃO fiz e por quê
- `src/hooks/auth/useAuth.tsx` não foi tocado: o Edge já devolve o MESMO 401 de credencial inválida e o front
  (`AuthService.signIn`) já trata como erro genérico — não há motivo para mudar o front.
- Não adicionei migration/RPC: a leitura usa a tabela `profiles` existente (`user_id` UNIQUE NOT NULL).

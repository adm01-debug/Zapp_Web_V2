Especialista: semisenior (area-edge-api)

## Sensibilidade
- O diff toca `service_role` (client de serviço) e `requireAuth` — o portão retém para o revisor forte.
- Nenhuma proteção afrouxada: a trava NOVA só NEGA — 403 neutro para perfil inativo/ausente/null e 503 (fail-closed)
  quando a consulta falha ou a promise rejeita. Nada que antes era liberado passou a ser liberado. Prova do caso
  negado: `require-auth-profile-active.test.ts` (inativo → 403, ausente → 403, `is_active` null → 403, erro → 503).
- Nenhuma referência ao banco/endpoint de produção: os testes usam stub de `fetch` e ids sintéticos.
- Para quem chama: `requireAuth` passa a fazer 1 leitura extra (`profiles.is_active` por `user_id`, igualdade exata)
  por requisição autenticada. Usuário ativo não percebe mudança.

## Diff do cartão (herdado + correção deste refazer)
Arquivos:
- `.tmp/relato.md`
- `supabase/functions/auth-login/index.ts` e `supabase/functions/auth-login/index.test.ts`
- `supabase/functions/_shared/validation.ts`
- `supabase/functions/_shared/__tests__/require-auth-profile-active.test.ts` (8 casos novos)
- `tests/contracts/requireauth-network-policy.contract.test.ts` (correção DESTE refazer: injeta o perfil ativo no caminho permitido)
- 12 testes de outras Edges: `ai-proxy`, `classify-emoji`, `classify-sticker`, `classify-audio-meme`,
  `elevenlabs-dialogue`, `elevenlabs-sts`, `elevenlabs-voice-design`, `fetch-link-preview`, `crm-integration`,
  `multiplix-voices`, `multiplix-audience`, `ai-kb-ingest` (`index.test.ts` de cada)

## O que mudou e por quê
- `supabase/functions/auth-login/index.ts` (+`index.test.ts`, herdado desta retentativa): o login
  resolve o perfil por `signIn.user.id` (igualdade exata, sem `ilike`) e, se o perfil estiver ausente/inativo/`null`,
  revoga a sessão recém-criada, registra a falha (`record_failed_login`) e devolve o MESMO 401/corpo da senha errada —
  sem oráculo. Erro na consulta → revoga e 500 (fail-closed).
- `supabase/functions/_shared/validation.ts` (herdado): `requireAuth` ganhou a trava R2-AUTH-004 — DEPOIS da autenticação e da
  política de rede, lê `profiles.is_active` por `user_id` e, se ausente/`false`/`null`, devolve 403 neutro
  ("Access denied", mesmo corpo da negação de rede); falha/rejeição da consulta → 503 fail-closed. A leitura é
  injetável (`getProfileActive`); o default é o client `service_role` real. Consumidores herdam a trava sem edição.
- `tests/contracts/requireauth-network-policy.contract.test.ts` (correção DESTE refazer): os 3 testes do caminho
  permitido passam a injetar `getProfileActive` com perfil ativo (`activeProfile().lookup`); o teste principal ainda
  prova que o `user_id` autenticado é lido (`expect(profile.calls).toEqual(['user-1'])`). Sem a injeção, o caminho
  permitido caía no client `service_role` real e virava 503 offline — foi exatamente a quebra do espelho.
- `supabase/functions/_shared/__tests__/require-auth-profile-active.test.ts`: 8 testes offline que chamam o `requireAuth`
  REAL (getUser/política/perfil injetados), cobrindo inativo, ausente, `is_active` null, ativo (segue), erro na consulta,
  promise rejeitada, ordem (política antes do perfil) e o `eq`/`user_id` do lookup default.
- Nos 12 testes das outras Edges só o stub de `fetch`/rota ganhou a resposta da nova leitura `profiles?select=is_active`.
  O `<handler>` dessas Edges NÃO mudou — é a consequência de a trava morar no middleware compartilhado. Sem esses stubs
  a leitura cairia no "nao stubado" e viraria 503.

## Prova
- vermelho antes (espelho sem a injeção do perfil): `bun run test:contracts -- tests/contracts/requireauth-network-policy.contract.test.ts`
  → `Tests 1 failed | 15 passed (16)` (`expected Response { status: 503 ... } to deeply equal { userId: 'user-1' }`).
- verde depois:
  - `bun run test:contracts -- tests/contracts/requireauth-network-policy.contract.test.ts` → `Test Files 1 passed (1); Tests 16 passed (16)`
  - `bun run test:contracts` (suíte completa) → `Test Files 88 passed (88); Tests 1367 passed (1367)`
  - `deno test -A --config scripts/ci/deno.json` nos 14 arquivos tocados (require-auth-profile-active, auth-login e as 12 Edges) → `ok | 185 passed | 0 failed`

## Pontos do revisor ([refazer 1])
- Ponto 1 (espelho do CI quebrado no empilhamento — `tests/contracts/requireauth-network-policy.contract.test.ts`): resolvido —
  `tests/contracts/requireauth-network-policy.contract.test.ts` injeta `getProfileActive` ativo nos 3 testes do caminho
  permitido e prova a leitura pelo `user_id`; contrato volta a `16 passed`. Mesma correção aplicada no cartão
  t_72376c22, portada para este diff para o empilhamento voltar ao verde.
- Ponto 2 (reproduzir com `zapp-verify full .`): reproduzi pelo próprio espelho que o `full` executa
  (`bun run test:contracts -- tests/contracts/requireauth-network-policy.contract.test.ts` → 1 failed antes, 16 passed depois)
  e validei a suíte de contratos inteira (88 arquivos, 1367 testes) mais o bloco Deno tocado (185 passed).

## O que NÃO fiz e por quê
- `src/hooks/auth/useAuth.tsx` não foi tocado: o Edge já devolve o MESMO 401 de credencial inválida e o front
  (`AuthService.signIn`) já trata como erro genérico — não há motivo para mudar o front.
- Não adicionei migration/RPC: a leitura usa a tabela `profiles` existente (`user_id` UNIQUE NOT NULL).
- Não alterei `supabase/functions/_shared/validation.ts` neste refazer: a trava herdada já estava correta; só o espelho
  precisava acompanhar o novo passo (perfil depois da política).

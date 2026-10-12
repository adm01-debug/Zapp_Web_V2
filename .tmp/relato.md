Especialista: complexo (area-auth-seguranca; executor: Claude Code + plano Anthropic)
Cartão t_20077c25 — bloqueio de login por cidade, paridade Promo Gifts V4, com a correção
de arquitetura do coordenador (cidade só de header confiável cf-ipcity; p_city na RPC).

## O que mudou e por quê
- supabase/migrations/20261007022808_city_whitelist_network_policy.sql: tabela city_whitelist
  (RLS, city_key gerada com normalização sem acento, unique, fail-closed), toggle
  city_whitelist_enabled em geo_blocking_settings (default false) e resolve_network_policy
  com p_city — lista vazia ou cidade ausente com toggle ligado nega (city_blocked).
- supabase/functions/_shared/request-policy.ts: extractCity (só cf-ipcity, recupera UTF-8
  entregue como latin1, null se ausente/inválida) + normalizeCity; p_city chega à RPC;
  city_blocked vira o mesmo 403 genérico de país, antes de body/credenciais/efeitos.
- src/hooks/security/useCityWhitelist.ts + src/components/security/CityWhitelistPanel.tsx
  (plugado na aba geo do SecurityView.tsx): toggle, busca, adicionar/remover com confirmação.
- Provas: scripts/db-audit/city-whitelist-network-policy.test.sh (PG 17 descartável,
  red→green + mutação) e supabase/functions/_shared/__tests__/request-policy-city.test.ts
  (handler real handleLogin). ALLOWLIST em scripts/ci/check-test-inventory.mjs;
  supabase/deployment-manifest.json regenerado (81 bundles que importam request-policy).

## Prova
- vermelho antes: `bash scripts/db-audit/city-whitelist-network-policy.test.sh` (sem migration) →
  `[PASS] RPC de cidade (6 args) AUSENTE (defeito)` + `[PASS] estado anterior permite
  qualquer cidade (login passa por cidade fora da lista)` (Bloco A)
- verde depois: mesmo comando → `OK — bloqueio por cidade na RPC canônica verificado
  (red → green + mutação).` (inclui `[PASS] mutação: sem o check, cidade fora da lista
  passa (o teste a pega)`)
- verde depois: `deno test ... request-policy-city.test.ts` → `ok | 6 passed | 0 failed (32ms)`
- sem regressão: `deno test ... request-policy.test.ts auth-login/index.test.ts` →
  `ok | 25 passed | 0 failed`; `npx vitest run CityWhitelistPanel.test.tsx` →
  `Test Files 1 passed (1); Tests 2 passed (2)`; a11y SecurityView idem 2 passed;
  tsc sem erro nos arquivos do cartão; eslint limpo; `hermes-db-migrar` → APLICADA no
  banco LOCAL (produção não tocada)

## O que NÃO fiz e por quê
- Não regenerei src/integrations/supabase/types.ts (types-sync roda depois do apply; hook
  e painel usam cast local isolado, sem tocar nele).
- Removi a forma de 5 args da RPC em vez de manter wrapper: o único chamador no repo é
  request-policy.ts (atualizado no mesmo diff); sem caminho sem cidade. Demais testes que
  citam a RPC usam mock pelo nome (inalterado).
- check-test-inventory ainda lista 4 órfãos de OUTROS cartões (department-invite, talkx,
  team-chat-media, team-direct-conversation-race); o meu está na ALLOWLIST com justificativa.

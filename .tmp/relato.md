Especialista: Hugo (area-front-hooks)

## Premissa do cartão: DESATUALIZADA — a lacuna já está fechada na base
O cartão pede: "Confira no código ATUAL que a lacuna ainda existe... Se já estiver resolvida,
escreva a prova e feche SEM commit de código." Conferi e a lacuna NÃO existe mais na ponta de
dia/2026-10-13. Não há correção a fazer; entrego a prova.

## Prova de que a lacuna está fechada (2 metades do defeito)

1) O acesso direto à tabela inexistente saiu — a gravação passou para a RPC canônica.
- src/hooks/team-chat/useDepartmentManagement.ts:247-276 (useSaveDepartmentWhatsApp) chama
  supabase.rpc('set_department_whatsapp_config', { p_department_id, p_whatsapp_mode, p_api_key })
  e trata { ok:false, error } como recusa (linha 268-269).
- `grep -n "\.from(" src/hooks/team-chat/useDepartmentManagement.ts` NÃO mostra nenhum
  .from('department_whatsapp_configs'); os .from() restantes são department_audit_logs,
  department_invites e profiles — todas no catálogo. O consumidor direto da tabela inexistente
  não existe mais.
- `git grep -n department_whatsapp_configs -- src scripts supabase` só acha ocorrências em
  COMENTÁRIO de teste (useDepartmentManagement.test.tsx:74,97) e no _resolvido do baseline —
  nenhuma chamada de acesso.

2) A entrada saiu do baseline do supabase-usage-guard.
- scripts/db-audit/known-violations.json:5-8 — o array `known` tem apenas 2 chaves
  (rpc:set_default_whatsapp_connection e rpc:talkx_campaign_window_open). A chave
  "from:department_whatsapp_configs" NÃO está no baseline; está só registrada em `_resolvido`
  (linha 10) como resolvida em 2026-10-08.

## Histórico (o trabalho já foi integrado; nada a cherry-pickar)
- 7798905b7a "fix(ci/devops): entrada from:department_whatsapp_configs sai do baseline (SL-144)" —
  a remoção do baseline já está em dia/2026-10-13.
- 398b9d5e14 "fix(ci/devops): Entrada from:department_whatsapp_configs continua no ba (SL-144)"
  (commit do cartão 2610091724d164) — a normalização do p_api_key para undefined (mesmo alvo do
  commit e8bef0d86 citado no "trabalho anterior") já está na base, com a variante aceita pelo
  revisor: `config.evolution_api_key || undefined` / `config.official_token || undefined`.
  Portanto o commit e8bef0d86 não precisa ser trazido: o efeito dele já está integrado.

## Prova (executado agora)
- teste do hook (verde): `npx vitest run src/hooks/team-chat/__tests__/useDepartmentManagement.test.tsx`
  → `Test Files 1 passed (1); Tests 7 passed (7)`
- contrato de banco da RPC (verde): `bash scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh`
  → termina com `PASS: TC-005 (F10)` (todos os blocos A/B/C PASS, incluindo o rollback)
- baseline sem a entrada (grep acima): só as 2 chaves rpc; a chave from:department_whatsapp_configs
  está em `_resolvido`.

## Diferença (diff)
Diff vazio por decisão do próprio cartão ("feche SEM commit de código"): a lacuna já estava
fechada na base. Commit vazio para o fechar poder avaliar.

## O que NÃO fiz e por quê
- Não cherry-pickei e8bef0d86: o cartão manda fechar sem commit quando já resolvido, e o efeito
  desse commit (normalizar chave vazia) já está na base via 398b9d5e14.
- Não toquei em nenhum arquivo de produção.

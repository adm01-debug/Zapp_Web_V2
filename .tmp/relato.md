# Relato — [retomar] fix(frontend): select explicito nas tabelas sensiveis restantes (N-216)

CONCLUÍDO. Sem código a mudar: o defeito do pedido (`.select('*')` nas 6 tabelas sensíveis)
já está corrigido no código ATUAL, o do workspace de hoje. Nenhuma pendência.

## Como resolvi o motivo do cartão (conflito com a ponta)
O workspace nasceu na ponta `dia/2026-10-13` (o cartão citava `dia/2026-10-12`, que já
avançou). Conferi o código atual antes de mexer, como o cartão manda: as 6 tabelas já estão
com lista explícita de colunas, por commits independentes que entraram na ponta. O
cherry-pick do trabalho anterior (`afaa78724`) cairia sobre código idêntico já presente e
só geraria conflito. Logo, resolvi o motivo do cartão não trazendo mudança duplicada: nada
a rebasear — o conteúdo pedido já está na ponta. Diff de código vazio (só o commit do relato).

## O que mudou e por quê
- Nenhuma linha de `src/`: nada a mudar, o defeito já não existe no código atual.
- 1 arquivo, o próprio relato (`.tmp/relato.md`).

## Prova do critério 1 (nenhum `.select('*')` nas 6 tabelas)
Comando rodado no workspace:
  for t in whatsapp_connections ai_providers password_reset_requests_safe blocked_ips ip_whitelist user_devices audit_logs; do grep -rn -A1 "\.from('$t')" src | grep "select('\*')"; done
Resultado: saída VAZIA para as 7 tabelas sensíveis (o único hit é falso-positivo: a linha
após `.from('whatsapp_connections')` em useMonitoringData.ts:141 é `connection_health_logs`,
fora do escopo). O grep amplo `grep -rn "select('\*')" src` confirma: nenhuma ocorrência
remanescente toca as 6 tabelas.

Vermelho antes (base antiga `03db8d720c`), a mesma checagem acusava:
  `git show 03db8d720c:src/components/admin/useAdminData.ts`    -> linhas 80, 85, 100 = `.select('*')`
  `git show 03db8d720c:src/hooks/ui/useDeviceDetection.ts`      -> linhas 141, 157 = `.select('*')`

Verde depois — commits que corrigiram cada tabela na ponta atual:
- whatsapp_connections: a543e90ecc (useConnectionsManager, useDiagnosticsData), 98ee8fe6ad (useMonitoringData), a2b733ecfd (CSATAutoConfig)
- ai_providers:          1200745039 (useAIProviders — sem api_key_secret_name)
- password_reset_requests_safe / blocked_ips / ip_whitelist: 8cfc888cf8
- user_devices:          2359b8bbb5
- audit_logs:            d15928ad16 (useAdminData), 8cf962c15b (AuditLogDashboard, useAIStats, useSentimentAlerts)

## Prova do critério 2 (nenhuma coluna usada pela UI foi cortada)
As guardas de regressão da própria ponta renderizam o componente/hook REAL com mock do
cliente Supabase e provam a lista explícita:
  comando: npx vitest run src/components/settings/ai-providers/__tests__/useAIProviders.select.test.tsx src/hooks/__tests__/useDeviceDetection.test.tsx src/hooks/inbox/__tests__/useConnectionsManager.qrIdentity.test.ts src/hooks/analytics/__tests__/useAIStats.test.tsx
  resultado: Test Files 4 passed (4); Tests 53 passed | 2 expected fail (55)
Assertivas: `selectArg.value` sem `api_key_secret_name` e != '*' (provedores de IA); nenhum
`select` com '*' em user_devices/user_sessions; lista explícita sem `qr_code` nem
`instance_token_secret_id` (whatsapp_connections).

## Escopo respeitado
- Não commitei código: nada em `src/` mudou, conforme o cartão autoriza quando o defeito já está resolvido.
- Não criei teste novo: as guardas de regressão exigidas já existem na ponta e passam.
- Não expandi às demais tabelas com `.select('*')`: fora de escopo por decisão do próprio cartão.

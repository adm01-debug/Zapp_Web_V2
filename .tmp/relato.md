# Relato — [retomar] fix(frontend): select explicito nas tabelas sensiveis restantes (N-216)

CONCLUÍDO. O defeito do pedido (`.select('*')` nas 6 tabelas sensíveis) já está corrigido no
código ATUAL, o do workspace de hoje. Não havia código a mudar; entrego com a prova abaixo.

## Como resolvi o motivo do cartão (conflito com a ponta)
O workspace nasceu na ponta `dia/2026-10-13` (o cartão citava `dia/2026-10-12`, que já
avançou). Conferi o código atual antes de mexer, como o cartão manda: as 6 tabelas já estão
com lista explícita de colunas, por commits independentes que entraram na ponta. O
cherry-pick do trabalho anterior (`afaa78724`) cairia sobre código idêntico já presente e só
geraria conflito. Logo, o motivo do cartão está resolvido: o conteúdo pedido já vive na
ponta, sem mudança duplicada a rebasear. Diff de código vazio.

## O que mudou e por quê
- Nenhuma linha de `src/`: o defeito já não existe no código atual.
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
- ai_providers:          1200745039 (useAIProviders, sem api_key_secret_name)
- password_reset_requests_safe / blocked_ips / ip_whitelist: 8cfc888cf8
- user_devices:          2359b8bbb5
- audit_logs:            d15928ad16 (useAdminData), 8cf962c15b (AuditLogDashboard, useAIStats, useSentimentAlerts)

## Prova do critério 2 (nenhuma coluna usada pela UI foi cortada)
As guardas de regressão da própria ponta renderizam o componente/hook REAL com mock do
cliente Supabase e provam a lista explícita de colunas:
  comando: npx vitest run src/components/settings/ai-providers/__tests__/useAIProviders.select.test.tsx src/hooks/__tests__/useDeviceDetection.test.tsx src/hooks/inbox/__tests__/useConnectionsManager.qrIdentity.test.ts
  resultado: Test Files 3 passed (3); Tests 20 passed (20)
Zero falhas, zero pulados. Assertivas: `selectArg.value` sem `api_key_secret_name` e != '*'
(provedores de IA); nenhum `select` com '*' em user_devices/user_sessions; lista explícita sem
`qr_code` nem `instance_token_secret_id` (whatsapp_connections).

## Escopo respeitado
- Sem commit de código: nada em `src/` mudou, e o cartão autoriza fechar assim quando o defeito já está resolvido.
- Sem teste novo: as guardas de regressão exigidas já existem na ponta e passam.
- Sem expansão às demais tabelas com `.select('*')`: fora de escopo por decisão do cartão.

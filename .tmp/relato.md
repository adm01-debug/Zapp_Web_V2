# Relato — [retomar] fix(frontend): select explicito nas tabelas sensiveis restantes (N-216)

## Como resolvi o motivo do cartao (conflito com a ponta)
O workspace novo foi criado a partir da ponta ATUAL `dia/2026-10-13` (o cartao citava
`dia/2026-10-12`, que ja avancou). Conferi o codigo ATUAL, como o cartao manda, antes de
fazer cherry-pick: **o defeito do pedido (`.select('*')` nas 6 tabelas sensiveis) ja esta
corrigido na ponta atual** por commits independentes que entraram nela. Cherry-pick do
trabalho anterior (`afaa78724`) duplicaria mudanca ja presente e daria conflito em cima de
codigo identico — por isso nao commitei codigo (o cartao autoriza: "se ja foi corrigido,
escreva isso em .tmp/relato.md com a prova e feche sem commit de codigo"). Diff vazio.

## O que mudou e por que
- Nenhuma mudanca de codigo (diff vazio): o defeito nao existe mais no codigo atual.

## Prova do criterio 1 (nenhum `.select('*')` nas 6 tabelas)
Comando (workdir = workspace):
  for t in whatsapp_connections ai_providers password_reset_requests_safe blocked_ips ip_whitelist user_devices audit_logs; do grep -rn -A1 "\.from('$t')" src | grep "select('\*')"; done
Resultado: vazio para todas as 6 tabelas (o unico hit e falso-positivo: a linha seguinte a
`.from('whatsapp_connections')` em useMonitoringData.ts:141 e o `connection_health_logs`,
tabela fora do escopo). Grep amplo `grep -rn "select('\*')" src` tambem confirma que nenhum
`.select('*')` remanescente toca as 6 tabelas.

Vermelho antes (base antiga, `03db8d720c`): os mesmos arquivos tinham `.select('*')`
  git show 03db8d720c:src/components/admin/useAdminData.ts    -> linhas 80, 85, 100 = .select('*')
  git show 03db8d720c:src/hooks/ui/useDeviceDetection.ts      -> linhas 141, 157 = .select('*')

Verde depois — commits que ja corrigiram cada tabela na ponta atual:
- whatsapp_connections: a543e90ecc (useConnectionsManager, useDiagnosticsData), 98ee8fe6ad (useMonitoringData), a2b733ecfd (CSATAutoConfig)
- ai_providers:          1200745039 (useAIProviders — sem api_key_secret_name)
- password_reset_requests_safe / blocked_ips / ip_whitelist: 8cfc888cf8
- user_devices:          2359b8bbb5
- audit_logs:            d15928ad16 (useAdminData), 8cf962c15b (AuditLogDashboard, useAIStats, useSentimentAlerts)

## Prova do criterio 2 (nenhuma coluna usada pela UI foi cortada)
As guardas de regressao da propria ponta cobrem os hooks das tabelas sensiveis e provam a
lista explicita de colunas (renderizam o componente/hook REAL, nao mock que ja traz a
resposta):
  npx vitest run src/components/settings/ai-providers/__tests__/useAIProviders.select.test.tsx \
                src/hooks/__tests__/useDeviceDetection.test.tsx \
                src/hooks/inbox/__tests__/useConnectionsManager.qrIdentity.test.ts \
                src/hooks/analytics/__tests__/useAIStats.test.tsx
  -> Test Files 4 passed (4); Tests 53 passed | 2 expected fail (55)
Elas afirmam: `selectArg.value` sem `api_key_secret_name` e != '*' (useAIProviders); nenhum
`select` com '*' em user_devices/user_sessions (useDeviceDetection); lista explicita sem
`qr_code` nem `instance_token_secret_id` (useConnectionsManager).

## O que NAO fiz e por que
- Nao fiz cherry-pick nem criei commit: as mudancas ja estao na ponta atual (criterio 1 verde
  sem tocar em codigo); o cartao manda fechar sem commit nesse caso.
- Nao criei teste novo ("controle novo" nesse cenario ja foi recusa do revisor). As guardas de
  regressao exigidas pela intencao do pedido ja existem na ponta e passam.
- Nao expandi para as demais ocorrencias de `.select('*')` em outras tabelas (fora de escopo,
  o proprio cartao manda deixar para cartao futuro).

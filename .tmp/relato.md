Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/connections/ConnectionsView.tsx`: `handleSyncHistory` passou a tratar a recusa do provedor — quando a ação `evolution-sync` responde `notSupported` (ou `success === false`) mostra o toast "Histórico não suportado" com a `message` e marca `historyNotSupported`; antes caía no toast de sucesso "Sincronização concluída! 0 mensagens". Novo `handleHealthCheck` usa a ação JÁ existente `connection-health-check` (staff) e mantém `checkingHealth` por id. Os dois estados são repassados ao cartão.
- `src/components/connections/ConnectionCard.tsx`: mostra "Último check há X" (`formatDistanceToNow` com locale ptBR) quando `last_health_check` existe; novo item "Checar agora" no menu (só `isSupervisor`, desabilitado com spinner enquanto `checkingHealth === id`) que chama `onHealthCheck`; "Sincronizar Histórico" some quando `historyNotSupported`. Os dois spinners (`Loader2`) usam `motion-safe:animate-spin`.
- `src/components/monitoring/MonitoringHealthLogs.tsx`: `statusCfg` ganhou `timeout` (Tempo esgotado) e `no_credentials` (Sem credencial), com rótulo pt-BR no badge no lugar do status cru; o filtro "Erro" e o contador `✗` passam a agrupar os dois; as cores do mapa e do tempo de resposta migraram para tokens do sistema (`success`/`warning`/`destructive`), sem `emerald-*`/`amber-*`.

## Prova
- vermelho antes (fontes recolocadas na base `dia/2026-10-13`, testes novos mantidos): `npx vitest run <os 3 testes>` → `Test Files 3 failed (3); Tests 10 failed | 6 passed (16)`; o erro do monitor era `expected '<div …text-emerald-500…' not to match /emerald-\d/` e os cartões na base não renderizavam "Checar agora"/"Último check há X".
- verde depois (mesmos 3 testes, fontes restauradas): `npx vitest run src/components/monitoring/__tests__/MonitoringHealthLogs.status.test.tsx src/components/connections/__tests__/ConnectionCard.saude.test.tsx src/components/connections/__tests__/ConnectionsView.sync-historico.test.tsx` → `Test Files 3 passed (3); Tests 16 passed (16)`, 0 falhas, 0 pulados.
- regressão na vizinhança: `npx vitest run src/components/connections/__tests__ src/components/monitoring/__tests__` → `Test Files 16 passed (16); Tests 79 passed (79)`.

Os testes chamam os componentes reais (o cartão e a view não são substituídos por mock): o de view abre o menu real do `ConnectionCard` e clica em "Sincronizar Histórico"/"Checar agora", e confere o payload de `functions.invoke`; o de cartão afirma o texto "Último check há 5 minutos", a ausência do item em GO e a chamada de `onHealthCheck`.

## O que NÃO fiz e por quê
- Não traduzi o rótulo "Retry" nem escondi o `instance_id` cru do cartão (apontado no comentário PD-26/t_53fc1ddb): não está no O QUE FAZER deste cartão.
- O "provedor é GO" é detectado pela RESPOSTA real da ação (`notSupported`), porque o front não conhece o flavor do servidor; o item some da tela logo após a primeira recusa (esconder é derivado do aviso, como o cartão pede).
- Estados vazio/carregando/erro da tela de Conexões não mudaram; o health check por conexão reaproveita a ação existente e a atualização vem do realtime de `whatsapp_connections`.

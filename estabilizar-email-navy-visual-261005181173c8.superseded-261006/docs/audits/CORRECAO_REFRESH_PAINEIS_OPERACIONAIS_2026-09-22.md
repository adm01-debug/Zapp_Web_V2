# Correcao do refresh dos paineis operacionais

## Evidencia e escopo

O [DB Live Guard 35767806526](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806526)
coletou a publication canonica da main `102a5001`: `rate_limit_logs` e
`connection_health_logs` nao sao publicadas. As migrations historicas retiraram
essas tabelas, mas os dois paineis ainda dependiam de INSERT via Realtime para
atualizar depois da leitura inicial. O diagnostico completo esta na
[PR documental #515](https://github.com/adm01-debug/Zapp_Web_V2/pull/515).

Dois novos cenarios falharam contra a implementacao anterior (15 PASS / 2 FAIL):
passados 30 segundos sem eventos, nenhuma nova leitura era feita. Os mocks
anteriores verificavam apenas a criacao de uma subscription, nao a entrega.

## Implementacao

- `useVisiblePolling`: leitura imediata quando visivel/online, nova leitura
  30 segundos apos a conclusao; uma requisicao por vez, recuperacao ao voltar
  a aba/conexao, cleanup de listeners/timer e AbortController no unmount.
- Refresh manual durante uma leitura aguarda uma unica leitura adicional,
  evitando reaproveitar snapshot anterior a uma acao do usuario. Chamadas
  manuais concorrentes se unem ao mesmo refresh adicional.
- `useRateLimitLogs`: leitura autenticada existente, limite 100; recalcula
  estatisticas junto com as linhas. A pagina habilita consultas somente
  quando `isAdmin || isSupervisor`; RLS continua sendo a autorizacao real.
- `ConnectionHealthPanel`: recarrega conexoes e ultimos 50 logs armazenados.
  O polling **nao invoca** `connection-health-check`; essa operacao continua
  exclusiva do botao acionado pelo usuario.
- Consultas recebem cancelamento de lifecycle combinado com timeout de 15s.
  Resultados abortados/tardios nao atualizam estado. Uma falha conserva o
  ultimo snapshot e permite nova tentativa na proxima janela.

Sem nova migration, grant, publication, secret, canal de broadcasting ou
alteracao de identidade. Nenhum teste enviou campanhas ou mensagens reais.

## Cenarios de regressao

28 testes dirigidos aprovados: leituras periodicas nos dois paineis sem canal
Realtime, atualizacao conjunta de estatisticas, acesso desabilitado, aba
oculta, offline/online, tarefa longa, refreshes manuais concorrentes, erro e
recuperacao, cancelamento, StrictMode e troca do callback sem timer residual.
Os testes existentes de leitura inicial e health check manual foram mantidos.

Validacao geral local: **3.159 testes PASS / 35 TODO** em 239 arquivos,
167 contratos PASS, typecheck exit 0, usage guard zero violacoes e Actions
pinadas em 11 workflows. Lint: 1.101 ocorrencias historicas, zero novas
(1.104 antes desta correcao, baseline 1.107). Build e budget aprovados:
JS inicial 325.5/340 KB gzip, maior chunk 486.0/550, total 3961.7/4000.
Nao se aumentaram budgets, nao se criaram suppressions e nao se removeram TODO.

## Limites e rollout

Esta correcao trata **dois dos quatro** consumidores inconsistentes encontrados.
`useRealtimeSentimentAlerts` e `useIncomingCallListener` continuam exigindo
correcao separada: notificacoes nao devem herdar automaticamente a politica de
pausa/latencia de um painel administrativo. Nao republicar tabelas de auditoria
nem ampliar ACLs para fazer esses testes passarem.

O intervalo e uma leitura periodica, nao promessa de entrega instantanea.
O frontend precisa ser integrado pelo fluxo protegido e implantado antes de
afirmar que a correcao esta online. A homologacao autenticada deve verificar
atualizacao sem reload, sem health check automatico e pausa ao ocultar a aba.
Nenhuma conta de cliente foi usada para essa homologacao nesta rodada.

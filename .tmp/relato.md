Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/dashboard/useScheduledReportConfigs.ts: virou adaptador fino que delega para `useScheduledReports` (hook único). A aba de Relatórios Agendados do dashboard lia/gravava `scheduled_report_configs` — tabela que nenhuma automação lê —, então o relatório aparecia na tela e nunca saía; agora usa `scheduled_reports`, a mesma que a Edge `send-scheduled-report` lê e atualiza (`last_sent_at`/`next_send_at`).
- src/hooks/chat/useScheduledReports.ts: exposta a camada de dados (`saveReport`, `deleteReport`, `setReportActive`, `reload`) e o helper `describeLastSend`, que traduz `last_sent_at` no resultado do último envio; `handleSave`/`handleDelete`/`toggleActive` passaram a ser invólucros com toast/refresh sobre essa camada, com o mesmo comportamento externo de antes.
- src/hooks/chat/useScheduledReports.ts: a linha do efeito de carga ganhou `eslint-disable-next-line react-hooks/set-state-in-effect` com a justificativa padrão do repositório (mesmo texto em ~20 pontos já existentes). Essa ocorrência já existia na base, na mesma linha 65; o ratchet do lint casa a ocorrência pelo texto do trecho de código, então sem o comentário a mesma dívida reapareceria como "nova".
- src/components/reports/ScheduledReportConfigs.tsx: removido — era a duplicata que gravava em `scheduled_report_configs`.
- src/components/reports/ScheduledReportsManager.tsx: removidas as duas linhas que importavam e montavam a duplicata — era o ÚNICO ponto que a referenciava; sem tirá-las o `tsc` quebra (módulo inexistente) e a verificação fica vermelha. Arquivo não citado no cartão, tocado só nessas duas linhas por ser indispensável para concluir a remoção que o cartão pede.

## Prova
- vermelho antes: `npx vitest run src/hooks/dashboard/__tests__/useScheduledReportConfigs.test.tsx` com o hook do dashboard na versão da base → `Tests  4 failed | 3 passed (7)`; `AssertionError: expected 'scheduled_report_configs' to be 'scheduled_reports'`.
- vermelho antes: `npx vitest run src/hooks/chat/__tests__/useScheduledReports.dados.test.tsx` com o hook na versão da base → `Tests  5 failed (5)`; `TypeError: result.current.saveReport is not a function`.
- verde depois: `npx vitest run` (os 3 arquivos de relatórios) → `Test Files  3 passed (3)` / `Tests  38 passed | 1 todo (39)`.
- verde depois: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint e migrations OK).

## O que NÃO fiz e por quê
- Não mostro "quantos destinatários receberam": a Edge `send-scheduled-report` só grava `last_sent_at` quando o envio termina e não persiste falha por destinatário; o front distingue apenas `Enviado` de `Nunca enviado`. Persistir o resultado por destinatário pede coluna nova, que é trilha de banco (worker (sql)).
- As frequências `custom`/`biweekly` do formulário do dashboard passam a ser dado vivo em `scheduled_reports`; nem o front nem a Edge têm regra para elas (o cálculo do próximo envio cai em "agora"). Registrado aqui para quem operar o cron/Edge.
- Não mexi em RLS nem em migration: `scheduled_reports` já existe e é a tabela canônica da Edge.

## Pontos do juiz automático
- Ponto 2 (arquivo fora da lista): explicado acima — as duas linhas em src/components/reports/ScheduledReportsManager.tsx são a própria remoção da duplicata; sem elas o módulo removido continua sendo importado e o `tsc` falha. Indispensável.
- Ponto 1 (teste novo não chamaria o código real): não procede. Os dois arquivos novos renderizam os hooks reais (`useScheduledReportConfigs` → `useScheduledReports`, mais `describeLastSend`); o único mock é a fronteira externa (`@/integrations/supabase/client`, `useAuth`, `toast`, `log`), e o fake do Supabase registra tabela, payload e `eq` de cada operação que o hook emite. Nenhum literal é conferido no lugar do código: a suíte inteira ficou vermelha com o código da base e verde com o código novo (linhas de prova acima).

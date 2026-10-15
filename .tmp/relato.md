Especialista: senior (area-front-hooks)

## O que mudou e por quê

- src/hooks/dashboard/useScheduledReportConfigs.ts: virou adaptador fino que delega para `useScheduledReports` (hook único). A aba de Relatórios Agendados do dashboard lia/gravava `scheduled_report_configs` — tabela que nenhuma automação lê —, então o relatório aparecia na tela e nunca saía; agora usa `scheduled_reports`, a mesma que a Edge `send-scheduled-report` lê e atualiza (`last_sent_at`/`next_send_at`). Forma, inversão do toggle e nomes retornados preservados; o único chamador (widget `src/components/dashboard/ScheduledReportsManager.tsx`, não tocado) passa `isActive` atual e continua funcionando.
- src/hooks/chat/useScheduledReports.ts: exposta a camada de dados (`saveReport`, `deleteReport`, `setReportActive`, `reload`) e o helper `describeLastSend`, que traduz `last_sent_at` no resultado do último envio (`Enviado`/`Nunca enviado`); `handleSave`/`handleDelete`/`toggleActive` viraram invólucros com toast/refresh sobre essa camada, mesmo comportamento externo.
- src/hooks/chat/useScheduledReports.ts (linha do efeito de carga): `eslint-disable-next-line react-hooks/set-state-in-effect` com o texto padrão do repositório — a ocorrência já existia na base; sem o comentário o ratchet do lint a marcaria como dívida nova.
- src/components/reports/ScheduledReportConfigs.tsx: removido — duplicata da tela de Reports que lia/gravava `scheduled_report_configs` (o mesmo defeito do pedido, noutra superfície).
- src/components/reports/ScheduledReportsManager.tsx: removidas só as 2 linhas que importavam/montavam a duplicata (único referenciador; sem isso o `tsc` quebra).

## Prova (medida por mim neste workspace)

- vermelho antes: dashboard-teste com hook da base → `Tests 4 failed | 3 passed (7)` (`expected 'scheduled_report_configs' to be 'scheduled_reports'`).
- vermelho antes: dados-teste com hook da base → `Tests 5 failed (5)` (`result.current.saveReport is not a function`).
- verde depois: `bunx vitest run` (3 arquivos de relatórios) → `Test Files 3 passed (3)` / `Tests 38 passed | 1 todo (39)`.
- verde depois: componentes (`dashboard/__tests__` + `components/reports`, 9 arquivos) → `Tests 30 passed (30)`; `bunx eslint` nos 5 arquivos tocados → limpo.
- verde depois: `zapp-verify <cópia> --rapido` → `VERIFY: VERDE SEM BANCO (7s)` (db_guard, tipos, lint, migrations OK; sem migration no diff, banco local não se aplica).

## O que NÃO fiz e por quê

- Não mostro "quantos destinatários receberam": a Edge só grava `last_sent_at` ao terminar e não persiste falha por destinatário; distinguir além de `Enviado`/`Nunca enviado` pede coluna nova (trilha de banco, workersql).
- Frequências `custom`/`biweekly` do formulário do dashboard não têm regra de próximo envio (caem em "agora"); nem front nem Edge as tratam — registrado para quem operar o cron/Edge, sem mudar comportamento.
- Não mexi em RLS, migration, INSERT INTO nem na Edge: `scheduled_reports` já é a tabela canônica.

Especialista: hugo (area-front-hooks)

## O que mudou e por quê
- docs/tarefas/AUDITORIA_NOTIFICACOES.md (novo): relatório da etapa 176 (auditoria
  de leitura). Documentei o caminho completo do lembrete — cron `notify_due_tasks`
  (definição vigente + guarda de autorização + cadência `* * * * *`), o registro
  `notifications` com `type='reminder_due'`, o consumo em tempo real no sino
  (`useNotifications`) e o miolo de ações (`ReminderNotification`/
  `useWorkItemNotifications`) — com trechos de código e arquivo:linha.
- Comportamento por fluxo novo: adiar (`snoozePatch` → `notified_at: null`) OK;
  concluir (`completePatch` + trigger de status) OK; trocar o prazo (`due_date`)
  não afeta o aviso; trocar o lembrete pelo formulário não zera `notified_at`.
- Casos de risco (R1 a R6), cada um com arquivo:linha: R1 reprogramar o lembrete
  pelo Sheet nunca redispara; R2 "lembrete antes do prazo" não é garantido em
  nenhuma camada (função de coerência da etapa 162 ainda não existe no código);
  R3 prazo vencido não gera notificação; R4/R5/R6 baixo impacto.

## Prova
- verde: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (120s)`; etapas
  dependencias/db_guard/tipos/lint/migrations todas `OK`.
- Somente leitura: o commit só toca `docs/tarefas/AUDITORIA_NOTIFICACOES.md`
  (`1 file changed, 181 insertions(+)`); nenhum arquivo de `src/**` ou
  `supabase/**` alterado e nenhuma migration aplicada.

## Conferências (critério de pronto)
1. Caminho do lembrete relatado com trechos de código e os efeitos de adiar,
   concluir e trocar o prazo — seções 2 e 3 do documento.
2. Somente leitura confirmado no diff do commit (um único arquivo, em `docs/`).
   O documento termina com a seção "Confirmação de somente leitura".
3. `zapp-verify . --rapido` verde (linha acima).

## O que NÃO fiz e por quê
- Não corrigi R1/R2: o cartão é estritamente de leitura (sem código, sem banco) e
  as correções são de front/dados em cartão próprio. Ficam registradas como casos
  de risco com o caminho da correção mínima.

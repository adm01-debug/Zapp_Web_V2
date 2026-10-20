## FATOS MEDIDOS PELO FECHAR (15/10 21:05, gerados por máquina: valem mais que números escritos à mão)
```
 .github/workflows/db-guard.yml                     |  12 +
 scripts/db-audit/admin-cron-jobs-rpc.test.sh       | 349 +++++++++++++++++++++
 src/components/admin/AdminView.tsx                 |  28 +-
 src/components/admin/CronJobsTab.tsx               | 173 ++++++++++
 .../admin/__tests__/AdminView.a11y.test.tsx        |   4 +-
 .../__tests__/AdminView.tarefas-agendadas.test.tsx |  92 ++++++
 .../admin/__tests__/CronJobsTab.tarefas.test.tsx   | 212 +++++++++++++
 src/components/admin/useTarefasAgendadas.ts        | 102 ++++++
 src/integrations/supabase/types.ts                 |  16 +
 .../migrations/20261011173000_admin_cron_jobs.sql  | 175 +++++++++++
 .../contracts/admin-cron-jobs-rpc.contract.test.ts | 144 +++++++++
 11 files changed, 1302 insertions(+), 5 deletions(-)
```
- Testes alterados neste cartão (4 arquivo[s]) rodados AGORA no seu commit: Test Files 3 passed (3);Tests 26 passed (26);Test Files 1 passed (1);Tests 9 passed (9)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Checagens determinísticas do fechar: 0 aviso(s) (ver relato do fechar)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: .github/workflows/db-guard.yml, supabase/migrations/20261011173000_admin_cron_jobs.sql; diff grande (63225 caracteres): cartão deveria ser menor; padrão sensível: caminho:\.githu, caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b

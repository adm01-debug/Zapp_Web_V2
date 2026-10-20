## FATOS MEDIDOS PELO FECHAR (16/10 13:51, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/ci/check-test-inventory.mjs                |   8 +
 scripts/db-audit/absent-agents-presence.test.sh    | 358 +++++++++++++++++++++
 .../20261014010805_absent_agents_use_presence.sql  | 120 +++++++
 3 files changed, 486 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261014010805_absent_agents_use_presence.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\), padrão:requireRole|isAdmin|

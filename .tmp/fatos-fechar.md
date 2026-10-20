## FATOS MEDIDOS PELO FECHAR (13/10 22:35, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  75 ++++--
 scripts/ci/check-test-inventory.mjs                |   8 +
 scripts/db-audit/absent-agents-presence.test.sh    | 285 +++++++++++++++++++++
 .../20261014010805_absent_agents_use_presence.sql  | 120 +++++++++
 4 files changed, 466 insertions(+), 22 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261014010805_absent_agents_use_presence.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\), padrão:requireRole|isAdmin|

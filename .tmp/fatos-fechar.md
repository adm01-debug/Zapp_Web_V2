## FATOS MEDIDOS PELO FECHAR (13/10 01:24, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 --
 src/integrations/supabase/types.ts                 |  20 ++
 .../20261013035338_admin_add_remove_role_rpc.sql   | 129 +++++++++
 supabase/tests/user_roles_add_remove_role.sql      | 288 +++++++++++++++++++++
 4 files changed, 437 insertions(+), 18 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql, supabase/tests/user_roles_add_remove_role.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

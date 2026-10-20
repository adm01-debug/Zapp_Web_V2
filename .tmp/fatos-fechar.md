## FATOS MEDIDOS PELO FECHAR (13/10 01:33, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 --
 src/integrations/supabase/types.ts                 |  20 ++
 .../admin/__tests__/useRolesPageState.rpc.test.tsx | 228 ++++++++++++++++
 src/pages/admin/useRolesPageState.ts               |  77 +++++-
 .../20261013035338_admin_add_remove_role_rpc.sql   | 129 +++++++++
 supabase/tests/user_roles_add_remove_role.sql      | 288 +++++++++++++++++++++
 6 files changed, 734 insertions(+), 26 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 8 passed (8)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql, supabase/tests/user_roles_add_remove_role.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

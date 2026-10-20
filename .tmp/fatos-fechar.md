## FATOS MEDIDOS PELO FECHAR (13/10 03:10, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  63 ++++-
 e2e/admin-papeis.spec.ts                           | 313 +++++++++++++++++++++
 playwright.config.ts                               |  12 +-
 src/integrations/supabase/types.ts                 |  20 ++
 .../admin/__tests__/useRolesPageState.rpc.test.tsx | 228 +++++++++++++++
 src/pages/admin/useRolesPageState.ts               |  77 ++++-
 .../20261013035338_admin_add_remove_role_rpc.sql   | 129 +++++++++
 supabase/tests/user_roles_add_remove_role.sql      | 288 +++++++++++++++++++
 8 files changed, 1109 insertions(+), 21 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 8 passed (8)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Checagens determinísticas do fechar: 0 aviso(s) (ver relato do fechar)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: playwright.config.ts, supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql, supabase/tests/user_roles_add_remove_role.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

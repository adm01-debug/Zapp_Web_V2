## FATOS MEDIDOS PELO FECHAR (11/10 16:59, gerados por máquina: valem mais que números escritos à mão)
```
 src/integrations/supabase/types.ts                 |  29 ++
 .../20261011192817_admin_login_attempts_rpc.sql    | 174 +++++++++++
 supabase/tests/admin_login_attempts.sql            | 342 +++++++++++++++++++++
 .../admin-login-attempts-rpc.contract.test.ts      |  97 ++++++
 4 files changed, 642 insertions(+)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 6 passed (6)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261011192817_admin_login_attempts_rpc.sql, supabase/tests/admin_login_attempts.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:auth\.(uid|role)\(\), padrão:requireRole|isAdmin|

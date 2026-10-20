## FATOS MEDIDOS PELO FECHAR (15/10 20:13, gerados por máquina: valem mais que números escritos à mão)
```
 src/integrations/supabase/types.ts                 |   1 +
 .../migrations/20261015223614_app_bootstrap.sql    | 195 ++++++++++++
 supabase/tests/app_bootstrap_rpc.sql               | 329 +++++++++++++++++++++
 3 files changed, 525 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015223614_app_bootstrap.sql, supabase/tests/app_bootstrap_rpc.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\)

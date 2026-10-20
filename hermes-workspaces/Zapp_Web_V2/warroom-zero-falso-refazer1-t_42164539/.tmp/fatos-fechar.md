## FATOS MEDIDOS PELO FECHAR (13/10 00:39, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/dashboard/WarRoomDashboard.tsx      | 157 ++++++++-----
 .../dashboard/__tests__/WarRoomEstados.test.tsx    | 150 ++++++++++++
 .../dashboard/war-room/WarRoomAgentCard.tsx        |  26 ++-
 .../business/__tests__/useWarRoomData.test.tsx     | 200 ++++++++++------
 src/hooks/business/useWarRoomData.ts               | 215 +++++++++--------
 src/integrations/supabase/types.ts                 |   8 +
 .../20261012225242_warroom_rpcs_agentes_filas.sql  | 232 ++++++++++++++++++
 supabase/tests/warroom_rpcs.sql                    | 258 +++++++++++++++++++++
 8 files changed, 1009 insertions(+), 237 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 16 passed (16)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261012225242_warroom_rpcs_agentes_filas.sql, supabase/tests/warroom_rpcs.sql; diff grande (78249 caracteres): cartão deveria ser menor; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b

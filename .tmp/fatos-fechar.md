## FATOS MEDIDOS PELO FECHAR (15/10 19:25, gerados por máquina: valem mais que números escritos à mão)
```
 .../alerts/EvolutionDisconnectBanner.tsx           |   9 +-
 .../EvolutionDisconnectBanner.a11y.test.tsx        |  23 +-
 .../EvolutionDisconnectBanner.behavior.test.tsx    |  21 +-
 ...tionDisconnectBanner.janela-manutencao.test.tsx |  22 +-
 .../EvolutionDisconnectBanner.preferencia.test.tsx |  76 ++++++
 .../settings/ConnectionAlertPreferences.tsx        | 160 +++++++++++
 .../__tests__/ConnectionAlertPreferences.test.tsx  | 141 ++++++++++
 .../useConnectionAlertPreferences.test.tsx         | 182 +++++++++++++
 src/hooks/system/useConnectionAlertPreferences.ts  | 122 +++++++++
 src/integrations/supabase/types.ts                 |  33 +++
 ...20261013044440_connection_alert_preferences.sql |  74 ++++++
 .../tests/connection_alert_preferences_rls.sql     | 291 +++++++++++++++++++++
 12 files changed, 1140 insertions(+), 14 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 30 passed (30)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013044440_connection_alert_preferences.sql, supabase/tests/connection_alert_preferences_rls.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:DISABLE ROW LEVEL, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:\.delete\(\)|\bDELET

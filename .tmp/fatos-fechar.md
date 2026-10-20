## FATOS MEDIDOS PELO FECHAR (12/10 10:16, gerados por máquina: valem mais que números escritos à mão)
```
 .github/workflows/db-guard.yml                     |   6 +
 .tmp/relato.md                                     |  77 ++++-
 scripts/db-audit/auto-reconnect-logs.test.sh       | 371 +++++++++++++++++++++
 src/integrations/supabase/types.ts                 |  71 ++++
 .../20261012134000_auto_reconnect_logs.sql         | 138 ++++++++
 5 files changed, 648 insertions(+), 15 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: .github/workflows/db-guard.yml, supabase/migrations/20261012134000_auto_reconnect_logs.sql; padrão sensível: caminho:\.githu, caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

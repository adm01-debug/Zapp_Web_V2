## FATOS MEDIDOS PELO FECHAR (11/10 20:07, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/db-audit/inbound-effects-replay.test.sh    | 327 +++++++++++++++++++++
 .../__tests__/inbound-effects-replay.test.ts       | 225 ++++++++++++++
 .../_shared/evolution-webhook-messages.ts          | 216 +++++++-------
 ...261005224959_inbound_message_effects_outbox.sql | 297 +++++++++++++++++++
 4 files changed, 948 insertions(+), 117 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial do [refazer]: juiz indisponível (não bloqueou)
- Checagens determinísticas do fechar: 0 aviso(s) (ver relato do fechar)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts, supabase/functions/_shared/evolution-webhook-messages.ts, supabase/migrations/20261005224959_inbound_message_effects_outbox.sql; diff grande (66596 caracteres): cartão deveria ser menor; padrão sensível: caminho:supabase/functions/_share, caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\.delete\(\)

## FATOS MEDIDOS PELO FECHAR (12/10 23:06, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  40 +++++--
 .../_shared/__tests__/avatar-storage-path.test.ts  | 107 +++++++++++++-----
 supabase/functions/_shared/evolution-helpers.ts    |  79 ++++++++++---
 supabase/functions/_shared/evolution-types.ts      |   4 +-
 .../_shared/evolution-webhook-handlers.ts          |  33 ++++--
 .../_shared/evolution-webhook-messages.ts          |   2 +-
 .../functions/batch-fetch-avatars/index.test.ts    | 124 +++++++++++++++++++++
 supabase/functions/batch-fetch-avatars/index.ts    |  74 ++++++------
 8 files changed, 364 insertions(+), 99 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/__tests__/avatar-storage-path.test.ts, supabase/functions/_shared/evolution-helpers.ts, supabase/functions/_shared/evolution-types.ts, supabase/functions/_shared/evolution-webhook-handlers.ts, supabase/functions/_shared/evolution-webhook-messages.ts; padrão sensível: caminho:supabase/functions/_share, padrão:rateLimit|rate_limit, padrão:requireRole|isAd

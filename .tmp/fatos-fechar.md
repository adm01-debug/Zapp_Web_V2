## FATOS MEDIDOS PELO FECHAR (16/10 13:46, gerados por máquina: valem mais que números escritos à mão)
```
 src/hooks/__tests__/useWhatsAppStatus.test.ts      |  25 +++
 src/hooks/integrations/useWhatsAppStatus.ts        |   2 +-
 .../__tests__/evolution-control-authz.test.ts      |   3 +
 .../functions/_shared/evolution-control-authz.ts   |   9 +-
 supabase/functions/evolution-api/index.test.ts     | 215 +++++++++++++++++++++
 supabase/functions/evolution-api/index.ts          | 143 ++++++++++++--
 6 files changed, 376 insertions(+), 21 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 12 passed (12)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/__tests__/evolution-control-authz.test.ts, supabase/functions/_shared/evolution-control-authz.ts; padrão sensível: caminho:supabase/functions/_share, padrão:requireRole|isAdmin|

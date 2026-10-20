## FATOS MEDIDOS PELO FECHAR (13/10 01:43, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 ---
 src/components/auth/ProtectedRoute.tsx             |  36 ++++-
 .../__tests__/ProtectedRoute.boot-erro.test.tsx    |  94 +++++++++++++
 .../ProtectedRoute.logout-aguardado.test.tsx       | 126 +++++++++++++++++
 src/hooks/__tests__/useUserRole.test.tsx           |   4 +
 .../auth/__tests__/useAuth.bootstrap-erro.test.tsx |  97 +++++++++++++
 src/hooks/auth/useAuth.tsx                         |  31 ++++-
 .../system/__tests__/useUserRole.realtime.test.tsx | 151 +++++++++++++++++++++
 src/hooks/system/useUserRole.ts                    |  80 ++++++++++-
 src/integrations/supabase/client.ts                |   6 +-
 src/lib/__tests__/safeStorage.adapter.test.ts      |  52 +++++++
 src/lib/safeStorage.ts                             |  65 ++++++++-
 12 files changed, 728 insertions(+), 32 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 22 passed (22)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|, padrão:verifyHmac|signature

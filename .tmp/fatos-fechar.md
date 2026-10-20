## FATOS MEDIDOS PELO FECHAR (13/10 02:34, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 ---
 e2e/auth.spec.ts                                   |  50 +++++--
 src/components/auth/ProtectedRoute.tsx             |  36 ++++-
 .../__tests__/ProtectedRoute.boot-erro.test.tsx    |  94 +++++++++++++
 .../ProtectedRoute.logout-aguardado.test.tsx       | 126 +++++++++++++++++
 .../mfa/__tests__/MFAEnroll.fluxo.test.tsx         |  83 +++++++++++
 .../mfa/__tests__/MFASettings.fluxo.test.tsx       |  81 +++++++++++
 .../mfa/__tests__/MFAVerify.fluxo.test.tsx         |  82 +++++++++++
 src/hooks/__tests__/useUserRole.test.tsx           |   4 +
 .../auth/__tests__/useAuth.bootstrap-erro.test.tsx |  97 +++++++++++++
 src/hooks/auth/useAuth.tsx                         |  31 ++++-
 .../system/__tests__/useUserRole.realtime.test.tsx | 151 +++++++++++++++++++++
 src/hooks/system/useUserRole.ts                    |  80 ++++++++++-
 src/integrations/supabase/client.ts                |   6 +-
 src/lib/__tests__/safeStorage.adapter.test.ts      |  52 +++++++
 src/lib/safeStorage.ts                             |  65 ++++++++-
 src/pages/__tests__/ForgotPassword.fluxo.test.tsx  | 116 ++++++++++++++++
 src/pages/__tests__/ResetPassword.fluxo.test.tsx   | 128 +++++++++++++++++
 src/pages/__tests__/SSOCallback.fluxo.test.tsx     | 121 +++++++++++++++++
 src/pages/__tests__/TwoFactorAuth.fluxo.test.tsx   | 116 ++++++++++++++++
 20 files changed, 1496 insertions(+), 41 deletions(-)
```
- Testes alterados neste cartão (13 arquivo[s]) rodados AGORA no seu commit: Test Files 13 passed (13);Tests 59 passed (59)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff grande (67871 caracteres): cartão deveria ser menor; padrão sensível: padrão:requireRole|isAdmin|, padrão:verifyHmac|signature

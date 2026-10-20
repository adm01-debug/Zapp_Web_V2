## FATOS MEDIDOS PELO FECHAR (13/10 02:03, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 ---
 src/components/auth/PasswordInput.tsx              |   1 -
 src/components/auth/ProtectedRoute.tsx             |  48 ++++++-
 src/components/auth/ReauthDialog.tsx               |  10 +-
 .../auth/__tests__/PasswordInput.a11y.test.tsx     |  42 ++++++
 .../__tests__/ProtectedRoute.boot-erro.test.tsx    | 111 +++++++++++++++
 .../ProtectedRoute.logout-aguardado.test.tsx       | 126 +++++++++++++++++
 .../auth/__tests__/ReauthDialog.a11y.test.tsx      |  57 ++++++++
 src/components/mfa/MFAEnroll.tsx                   |  14 +-
 src/components/mfa/MFAVerify.tsx                   |   6 +
 .../mfa/__tests__/MFAVerify.a11y.test.tsx          |  96 +++++++++++++
 src/hooks/__tests__/useUserRole.test.tsx           |   4 +
 .../auth/__tests__/useAuth.bootstrap-erro.test.tsx |  97 +++++++++++++
 src/hooks/auth/useAuth.tsx                         |  31 ++++-
 .../system/__tests__/useUserRole.realtime.test.tsx | 151 +++++++++++++++++++++
 src/hooks/system/useUserRole.ts                    |  80 ++++++++++-
 src/integrations/supabase/client.ts                |   6 +-
 src/lib/__tests__/safeStorage.adapter.test.ts      |  52 +++++++
 src/lib/safeStorage.ts                             |  65 ++++++++-
 src/pages/ForgotPassword.tsx                       |  10 +-
 src/pages/ResetPassword.tsx                        |  14 +-
 src/pages/TwoFactorAuth.tsx                        |  16 +--
 src/pages/__tests__/auth-telas-a11y.test.tsx       | 116 ++++++++++++++++
 23 files changed, 1117 insertions(+), 54 deletions(-)
```
- Testes alterados neste cartão (10 arquivo[s]) rodados AGORA no seu commit: Test Files 10 passed (10);Tests 37 passed (37)
- Prova vermelho→verde dos testes alterados: não rodou
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff grande (62328 caracteres): cartão deveria ser menor; padrão sensível: padrão:requireRole|isAdmin|, padrão:verifyHmac|signature

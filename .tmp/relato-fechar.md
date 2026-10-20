- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 35s;OK lint 5s;OK migrations 1s

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

Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- src/pages/__tests__/ResetPassword.fluxo.test.tsx (novo): link sem sessão não mostra o formulário; senha fraca e confirmação divergente barram ANTES do updateUser; erro do provedor cai na mensagem genérica (o `error` do client não é instância de Error, então a tela não vaza payload).
- src/pages/__tests__/ForgotPassword.fluxo.test.tsx (novo): e-mail inválido barrado antes de consultar o banco; e-mail INEXISTENTE mostra "solicitação enviada" sem inserir nada (não revela existência); e-mail existente insere o pedido com o user_id/email; erro de insert mostra erro. O submit usa `fireEvent.submit` no form porque o `input type=email` tem validação nativa que engolia o click.
- src/pages/__tests__/TwoFactorAuth.fluxo.test.tsx (novo): sem sessão → /auth; assurance nulo → tela de erro (não fica preso em "Verificando"); pendente → MFAVerify; nextLevel aal1 → destino.
- src/pages/__tests__/SSOCallback.fluxo.test.tsx (novo): sessão já existente redireciona ao destino; SIGNED_OUT durante o callback mostra "sessão não encontrada"; timeout de 10s mostra "tempo esgotado" (sem spinner infinito); erro na URL é sanitizado.
- src/components/mfa/__tests__/MFAVerify.fluxo.test.tsx (novo): busca fatores ao montar; só verifica com 6 dígitos; usa o id do fator VERIFICADO (não o primeiro da lista); sem fator verificado → erro; falha limpa o código.
- src/components/mfa/__tests__/MFAEnroll.fluxo.test.tsx (novo): fluxo intro→QR→verificação; copiar o segredo usa o clipboard; verifica com o id devolvido pelo enrollment; cancelar chama onCancel.
- src/components/mfa/__tests__/MFASettings.fluxo.test.tsx (novo): reflete ativo/inativo; lista os fatores; remoção só depois de confirmar o diálogo (e só do fator escolhido).
- e2e/auth.spec.ts (modificado): removidos os dois testes da aba de cadastro público (SG1); passa a exigir a AUSÊNCIA da aba; adicionado scan do axe na tela de login.

## Prova
- verde (3 rodadas): `npx vitest run <os 7 arquivos *.fluxo.test.tsx>` → `Test Files 7 passed (7); Tests 37 passed (37)` nas três.
- não-vacuidade: durante o desenvolvimento os testes falharam por motivos reais e eu corrigi o TESTE, não a produção — e-mail inválido não disparava o onSubmit (validação nativa do input), a mensagem do erro do Supabase é a genérica (não é Error), e o botão de copiar só existe no passo QR (eu clicava depois de avançar).

## Dependência trazida por cherry-pick (não é edição minha)
O cartão manda trazer o range do pai t_466d669c via cherry-pick do JSON em .v2-fila (base `dia/2026-10-13` → sha `95ee577df`). Por isso o diff CONTRA A BASE também mostra os arquivos do pai, que eu não editei:
- produção: src/hooks/auth/useAuth.tsx, src/hooks/system/useUserRole.ts, src/lib/safeStorage.ts, src/integrations/supabase/client.ts, src/components/auth/ProtectedRoute.tsx
- testes do pai: src/hooks/auth/__tests__/useAuth.bootstrap-erro.test.tsx, src/hooks/system/__tests__/useUserRole.realtime.test.tsx, src/hooks/__tests__/useUserRole.test.tsx, src/lib/__tests__/safeStorage.adapter.test.ts, src/components/auth/__tests__/ProtectedRoute.boot-erro.test.tsx, src/components/auth/__tests__/ProtectedRoute.logout-aguardado.test.tsx
A minha mudança são os 7 arquivos `*.fluxo.test.tsx` novos e o `e2e/auth.spec.ts`.

## O que NÃO fiz e por quê
- E2E: o e2e/auth.spec.ts foi atualizado mas NÃO foi rodado neste cartão (exige dev server + Chromium; o fechar roda só o --rapido). Fica para o integrador rodar `npm run test:e2e` (projeto "chromium").
- Regras do ProtectedRoute (papel/permissão/fallback/timeout/ /2fa com precedência): já cobertas por testes existentes no repo — ProtectedRoute.acesso-negado.test.tsx, ProtectedRoute.mfa.test.tsx e, vindos do cartão pai t_466d669c, ProtectedRoute.boot-erro.test.tsx (timeout de boot em vez de cair no /auth) e ProtectedRoute.logout-aguardado.test.tsx. Não dupliquei.
- Não toquei código de produção (regra do cartão). Nenhum defeito de produção encontrado nas telas testadas.

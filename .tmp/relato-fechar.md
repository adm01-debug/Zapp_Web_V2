- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 115s;OK lint 3s;OK migrations 1s

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

Especialista: hugo

## O que mudou e por quê
- src/components/auth/ProtectedRoute.tsx: os dois botões "Sair e Entrar Novamente" (tela de verificação e tela de erro de MFA) agora esperam `AuthService.signOut()` terminar — `.catch(() => undefined).finally(() => window.location.assign('/auth'))` — em vez de `void signOut()` seguido de `window.location.href = '/auth'`, que descarregava a página no meio do logout e devolvia o usuário logado. O mesmo arquivo ganhou a tela "Sem conexão com o servidor" com o botão "Tentar de novo" (chama `retryBootstrap`) quando o boot falha, no lugar de cair no /auth como se não houvesse sessão.
- src/hooks/auth/useAuth.tsx: o contexto passou a expor `bootstrapError` e `retryBootstrap`. O timeout de segurança de 10 s e a falha de `getSession` marcam o erro de boot (antes só liberavam o `loading`); um evento de sessão com usuário limpa o erro; `retryBootstrap` limpa o erro, volta ao loading e reexecuta o effect de sessão.
- src/hooks/system/useUserRole.ts: assina UM canal Realtime por usuário, filtrado por `user_id=eq.<id>`, sobre `user_roles` (invalida `['user-roles', id]`) e `profiles` (revalida o perfil). O canal é compartilhado com contador de ouvintes: `supabase.channel(topic)` devolve o MESMO canal para o mesmo tópico, então sem o contador os callbacks duplicariam entre as telas e o primeiro componente a desmontar fecharia o canal de todos; o cleanup fecha só quando a última tela sai (logout/troca de usuário). O cartão cita `src/hooks/auth/useUserRole.ts`; o arquivo real no repositório é `src/hooks/system/useUserRole.ts` (mesmo hook, mesma queryKey `['user-roles', user?.id]`).
- src/lib/safeStorage.ts + src/integrations/supabase/client.ts: `createSafeStorage()` substitui `window.localStorage` passado direto ao cliente Supabase. O acesso à propriedade pode lançar (modo privado / cookies bloqueados) e derrubava o import do módulo; o adapter protege o acesso e cai para um Map em memória na aba. O logger do safeStorage passou a ser resolvido apenas na hora de registrar, para importar o módulo (o boot importa) não depender de `@/lib/logger` estar completo.
- Testes: 5 arquivos novos (abaixo) e o mock do client em src/hooks/__tests__/useUserRole.test.tsx ganhou `channel`/`removeChannel`, porque o hook passou a assinar canal.

## Prova
- vermelho antes (antes das mudanças de código, só com os testes novos): `npx vitest run src/lib/__tests__/safeStorage.adapter.test.ts src/hooks/system/__tests__/useUserRole.realtime.test.tsx src/components/auth/__tests__/ProtectedRoute.logout-aguardado.test.tsx src/components/auth/__tests__/ProtectedRoute.boot-erro.test.tsx src/hooks/auth/__tests__/useAuth.bootstrap-erro.test.tsx` → `Test Files 5 failed (5); Tests 14 failed | 1 passed (15)` (erros: `bootstrapError` undefined; `assign` esperado com `/auth` e 0 chamadas; 0 assinaturas Realtime; `createSafeStorage` inexistente).
- verde depois (mesmos arquivos): `Test Files 5 passed (5); Tests 16 passed (16)`.
- regressão: `npx vitest run src/hooks src/lib src/integrations src/components/auth src/components/layout` → `Test Files 491 passed (491); Tests 4976 passed | 24 expected fail | 5 todo (5005)` — inclui o teste existente src/hooks/__tests__/useUserRole.test.tsx e src/hooks/__tests__/useTextToSpeech.test.ts.

## Arquivos fora da lista do cartão (por que foi indispensável)
- src/hooks/system/useUserRole.ts: o cartão lista `src/hooks/auth/useUserRole.ts`, que NÃO existe no repositório. O hook de papel é este arquivo (mesma queryKey `['user-roles', user?.id]`, mesma API de retorno); sem tocar nele o item "papel/perfil ao vivo (Realtime)" não teria onde ser feito. Nenhum arquivo novo foi criado em `src/hooks/auth/` para não duplicar o hook.
- src/lib/safeStorage.ts: o cartão pede o storage protegido "reaproveitando safeStorage" e lista só `src/integrations/supabase/client.ts`. `safeStorage` não tinha um adapter pronto, então a fábrica `createSafeStorage()` (com o fallback em memória) ficou no próprio `src/lib/safeStorage.ts` — que é a área de lib do meu perfil — e o `client.ts` só passou a usá-la. Foi o menor diff possível: nada em `client.ts` além do import e da troca de `storage:`.
- src/lib/__tests__/safeStorage.adapter.test.ts: é o teste que prova o item do storage (o `client.ts` em si não é testável sem subir o cliente Supabase, que exige env; a lógica do adapter é pura e vive no safeStorage).

## O que NÃO fiz e por quê
- não desenhei a tela nova além do mínimo (texto e botão): o visual do estado de boot é o PD-05, de outro perfil.
- não toquei em banco, Edge ou serviço de papel: o cartão é de estado/hooks no front.

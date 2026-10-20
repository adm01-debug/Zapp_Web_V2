Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 81s;OK lint 3s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 15:07, gerados por máquina: valem mais que números escritos à mão)
```
 src/App.tsx                                        |  11 +
 .../useWarRoomAlerts.cicloAtual.behavior.test.tsx  | 159 +++++++++++++++
 src/hooks/__tests__/useWarRoomAlerts.test.tsx      |   9 +-
 .../useWarRoomAlertsMute.behavior.test.tsx         |  23 ++-
 .../__tests__/useGlobalCrisisAlerts.test.tsx       | 206 +++++++++++++++++++
 .../useGlobalCrisisAlerts.warRoomMute.test.tsx     | 224 +++++++++++++++++++++
 src/hooks/business/useGlobalCrisisAlerts.tsx       |  75 +++++++
 src/hooks/business/useWarRoomAlerts.ts             |  59 ++++--
 src/hooks/business/warRoomAlertNotice.ts           | 114 +++++++++++
 src/utils/__tests__/notificationSounds.test.ts     |  62 +++++-
 src/utils/notificationSounds.ts                    |   9 +-
 11 files changed, 919 insertions(+), 32 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 40 passed (40)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|


Refazer 1 do cartão "alertas de crise globais + supervisão". Trouxe o trabalho
anterior (commit 2273c6444, via cherry-pick) e corrigi ponto a ponto a recusa.
O commit único 9a18da7c2c contém o cherry-pick + as correções abaixo; os
arquivos que EU mexi no refazer estão marcados com (R).

Ponto 1 — mudo explícito da War Room valendo quando o global venceria a disputa.
O que mudei (R): `src/hooks/business/warRoomAlertNotice.ts` ganhou o registro de
presença da tela (`registerWarRoomListener`/`isWarRoomListenerMounted`, contador
de montagens com cleanup no unmount); `useWarRoomAlerts.ts` registra ao montar;
`useGlobalCrisisAlerts.tsx` retorna cedo no INSERT quando a tela está aberta —
nem reivindica, nem toca, nem avisa. Com a tela fechada o contador é 0 e o
global anuncia sozinho. Escolhi a 1ª opção da recusa (global se cala, a tela
anuncia) em vez de estado de mudo compartilhado: é determinística e o som/toast/
desktop seguem exatamente o `soundGate` do painel, sem condição de corrida.
Teste que prova: `useGlobalCrisisAlerts.warRoomMute.test.tsx` → "mesmo INSERT
nos dois ouvintes: sem som e com UM toast só" (global com `soundEnabled: true`,
painel `useWarRoomAlerts(false)`). Vermelho sem a correção: 2 testes falham
(som do global toca / toast duplo); verde com ela: 3/3 passam.

Ponto 2 — teste com global + `useWarRoomAlerts(false)` juntos no mesmo INSERT.
O que mudei (R): arquivo novo
`src/hooks/business/__tests__/useGlobalCrisisAlerts.warRoomMute.test.tsx` com 3
casos: crítico mutado (sem som global, sem áudio da tela, 1 toast de erro, 1
desktop com `requireInteraction: true`); aviso mutado (1 toast de aviso, sem
som, `requireInteraction: false`); e global sozinho após desmontar a tela
(volta a tocar e avisar — o registro não fica preso). Os canais realtime são
capturados por tópico e o MESMO payload é entregue aos dois handlers.
Teste que prova: os 3 casos acima (saída: 3 passed). Vermelho antes (sem o
`return` do ponto 1): os 2 casos mutados falham; verde depois: passam. O teste
anterior "no duplicate inside War Room" (só `announceWarRoomAlert` direto)
continua passando e não foi alterado.

Ponto 3 — `requireInteraction` do alerta crítico no aviso de desktop: PRESERVADO,
não removido. O caminho anterior (Service Worker) marcava `requireInteraction`
para crítico; a entrega anterior trocou por `new Notification` que fecha em 5 s.
O que mudei (R): `src/utils/notificationSounds.ts` aceita
`requireInteraction?` (repasse ao construtor; pula o `setTimeout` de 5 s quando
verdadeiro — mudança aditiva, chamadores existentes inalterados) e
`announceWarRoomAlert` passa `requireInteraction: critico`. Não é perda
intencional: crítico fica FIXO até o clique, como antes; aviso comum continua
fechando em 5 s.
Teste que prova: `notificationSounds.test.ts` → "alerta crítico fica FIXO" e
"aviso comum fecha sozinho em 5 s". Vermelho no util base: o caso FIXO falha;
verde com a correção: passam.

Arquivos (git diff --name-only dia/2026-10-16):
src/App.tsx
src/hooks/__tests__/useWarRoomAlerts.cicloAtual.behavior.test.tsx
src/hooks/__tests__/useWarRoomAlerts.test.tsx
src/hooks/__tests__/useWarRoomAlertsMute.behavior.test.tsx
src/hooks/business/__tests__/useGlobalCrisisAlerts.test.tsx
src/hooks/business/__tests__/useGlobalCrisisAlerts.warRoomMute.test.tsx (R, novo)
src/hooks/business/useGlobalCrisisAlerts.tsx (R)
src/hooks/business/useWarRoomAlerts.ts (R)
src/hooks/business/warRoomAlertNotice.ts (R)
src/utils/__tests__/notificationSounds.test.ts (R)
src/utils/notificationSounds.ts (R)
Os 5 primeiros vêm do cherry-pick do trabalho anterior, inalterados por mim.

Sobre o aviso do juiz ("arquivos que o cartão não lista"): `src/App.tsx` veio no
trabalho anterior (monta o ouvinte global no shell — sem ele o cartão inteiro
não existe; a recusa não o contestou). `src/utils/notificationSounds.ts` e seu
teste são a preservação do `requireInteraction` que o ponto 3 da recusa pediu
explicitamente ("preserve esse comportamento") — sem tocar o util, o crítico
perdia o aviso fixo. Nada fora do título do cartão.

Verificação:
- bunx vitest run (6 arquivos: 2 de crise + warRoom + mute + cicloAtual +
  notificationSounds): 6 passed, 40 passed.
- bunx eslint nos 6 arquivos tocados: limpo.
- git diff dia/2026-10-16: 11 arquivos, 45.305 caracteres (< teto de 90 mil).

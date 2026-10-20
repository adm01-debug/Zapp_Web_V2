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

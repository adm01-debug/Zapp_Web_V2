## FATOS MEDIDOS PELO FECHAR (15/10 20:28, gerados por máquina: valem mais que números escritos à mão)
```
 src/App.tsx                                        |  11 ++
 .../useWarRoomAlerts.cicloAtual.behavior.test.tsx  | 159 ++++++++++++++++
 src/hooks/__tests__/useWarRoomAlerts.test.tsx      |   9 +-
 .../useWarRoomAlertsMute.behavior.test.tsx         |  23 ++-
 .../__tests__/useGlobalCrisisAlerts.test.tsx       | 206 +++++++++++++++++++++
 src/hooks/business/useGlobalCrisisAlerts.tsx       |  69 +++++++
 src/hooks/business/useWarRoomAlerts.ts             |  54 +++---
 src/hooks/business/warRoomAlertNotice.ts           |  91 +++++++++
 8 files changed, 593 insertions(+), 29 deletions(-)
```
- Testes alterados neste cartão (4 arquivo[s]) rodados AGORA no seu commit: Test Files 4 passed (4);Tests 21 passed (21)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|

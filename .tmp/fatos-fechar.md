## FATOS MEDIDOS PELO FECHAR (13/10 06:38, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  38 +-
 src/components/inbox/AudioRecorder.tsx             | 394 ++++++++++-----
 .../AudioRecorder.pausa-recuperacao.test.tsx       | 173 +++++++
 .../inbox/__tests__/AudioRecorder.test.tsx         |  22 +
 .../__tests__/useAudioRecorder.lifecycle.test.ts   |  40 ++
 .../useAudioRecorder.pausa-recuperacao.test.ts     | 323 +++++++++++++
 src/hooks/communication/useAudioRecorder.ts        | 529 +++++++++++++++++++--
 .../__tests__/useRealtimeInbox.sendAudio.test.tsx  |  53 ++-
 src/hooks/inbox/useRealtimeInbox.ts                |  16 +-
 src/lib/audio/__tests__/pttLimits.test.ts          | 151 ++++++
 src/lib/audio/pttLimits.ts                         | 147 ++++++
 11 files changed, 1716 insertions(+), 170 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 46 passed (46)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff grande (88741 caracteres): cartão deveria ser menor; padrão sensível: padrão:requireRole|isAdmin|

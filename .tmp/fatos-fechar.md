## FATOS MEDIDOS PELO FECHAR (15/10 18:46, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/InboxEmptyChat.tsx            | 16 ++++---
 src/components/inbox/KeyboardShortcutsHelp.tsx     |  9 ++--
 .../__tests__/InboxEmptyChat.atalhos.test.tsx      | 23 +++++-----
 .../keyboard/KeyboardShortcutsDialog.tsx           |  6 ++-
 .../__tests__/KeyboardShortcutsDialog.test.tsx     |  3 +-
 .../settings/KeyboardShortcutsSettings.tsx         | 11 ++++-
 .../__tests__/KeyboardShortcutsSettings.test.tsx   |  9 ++--
 .../ui/__tests__/command-palette-acoes.test.tsx    |  4 +-
 .../useCustomShortcuts.instancias.test.tsx         |  6 ++-
 .../shortcuts/__tests__/atalhosSemExecutor.test.ts | 47 +++++++++++++++++++
 src/hooks/shortcuts/defaultShortcuts.ts            | 52 ++++++++++++++++++++++
 src/hooks/ui/useGlobalKeyboardShortcuts.ts         | 31 ++++++++++---
 12 files changed, 182 insertions(+), 35 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 28 passed (28)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — teste existente pulado/afrouxado

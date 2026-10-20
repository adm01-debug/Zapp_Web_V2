## FATOS MEDIDOS PELO FECHAR (13/10 02:25, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  37 ++--
 src/components/admin/AdminUsersTable.tsx           |  29 ++-
 src/components/admin/ForceLogoutButton.tsx         |  17 +-
 .../__tests__/AdminUsersTable.reauth.test.tsx      | 110 ++++++++++
 .../admin/__tests__/ForceLogoutButton.test.tsx     |  85 ++++++--
 src/components/auth/ReauthDialog.tsx               | 222 +++++++++++++++++----
 src/components/auth/__tests__/ReauthGuard.test.tsx |  83 ++++++++
 .../connections/ConnectionDeleteDialog.tsx         |  16 +-
 .../__tests__/ConnectionCard.confirmacao.test.tsx  |  16 +-
 .../ConnectionDeleteDialog.reauth.test.tsx         |  73 +++++++
 src/pages/admin/RolesPage.tsx                      |  27 ++-
 .../admin/__tests__/RolesPage.reauth.test.tsx      | 104 ++++++++++
 12 files changed, 741 insertions(+), 78 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 24 passed (24)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|

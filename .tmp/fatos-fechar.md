## FATOS MEDIDOS PELO FECHAR (13/10 02:21, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  98 +++++++--
 src/components/admin/AdminAuditTable.tsx           |  11 +-
 src/components/admin/AdminUsersTable.tsx           |  19 +-
 src/components/admin/AdminView.tsx                 | 102 +++++++++-
 .../admin/__tests__/AdminUsersTable.roles.test.tsx |  72 +++++++
 .../admin/__tests__/AdminView.a11y.test.tsx        |   8 +-
 .../__tests__/AdminView.estados-tabelas.test.tsx   | 215 ++++++++++++++++++++
 .../AdminView.section-error-boundary.test.tsx      |   3 +
 .../__tests__/AdminView.servicosGoogle.test.tsx    |   4 +
 .../__tests__/useAdminData.erros-auditoria.test.ts | 225 +++++++++++++++++++++
 .../admin/__tests__/useAdminDataColumns.test.ts    |   3 +
 src/components/admin/useAdminData.ts               | 146 ++++++++++---
 12 files changed, 845 insertions(+), 61 deletions(-)
```
- Testes alterados neste cartão (7 arquivo[s]) rodados AGORA no seu commit: Test Files 7 passed (7);Tests 35 passed (35)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|, padrão:verifyHmac|signature

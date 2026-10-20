## FATOS MEDIDOS PELO FECHAR (13/10 04:55, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  75 +++-
 src/components/inbox/MessageContextActions.tsx     |  10 +-
 .../MessageContextActions.r2inb014.test.tsx        |  52 ++-
 src/components/inbox/chat/MessageHoverToolbar.tsx  |  14 +-
 .../__tests__/MessageHoverToolbar.delete.test.tsx  |  44 ++-
 src/components/inbox/tabs/FilesTab.tsx             |   5 +-
 .../inbox/tabs/__tests__/FilesTab.fase6.test.tsx   |  35 +-
 src/hooks/chat/__tests__/useFilesActions.test.tsx  |  26 +-
 src/hooks/chat/useFilesActions.ts                  |  17 +-
 src/services/__tests__/chat.service.delete.test.ts |  62 +++
 src/services/chat.service.ts                       |  22 +-
 .../20261013230001_delete_message_rpc.sql          | 101 +++++
 supabase/tests/delete_message_rpc.sql              | 421 +++++++++++++++++++++
 13 files changed, 780 insertions(+), 104 deletions(-)
```
- Testes alterados neste cartão (5 arquivo[s]) rodados AGORA no seu commit: Test Files 5 passed (5);Tests 22 passed (22)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013230001_delete_message_rpc.sql, supabase/tests/delete_message_rpc.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\)

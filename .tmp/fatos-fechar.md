## FATOS MEDIDOS PELO FECHAR (15/10 21:06, gerados por máquina: valem mais que números escritos à mão)
```
 .../__tests__/useAudioMemes.fechamento.test.tsx    |   3 +
 .../useAudioMemes.mediaVolumeBindings.test.tsx     |   7 +-
 .../__tests__/useAudioMemes.mutacoes.test.tsx      |   7 +-
 .../__tests__/useAudioMemes.realtime.test.tsx      | 189 +++++++++++++
 src/hooks/communication/useAudioMemes.ts           |  38 ++-
 .../20261015224516_audio_memes_storage_paths.sql   | 299 +++++++++++++++++++++
 supabase/tests/audio_memes_storage_paths.sql       | 203 ++++++++++++++
 7 files changed, 743 insertions(+), 3 deletions(-)
```
- Testes alterados neste cartão (4 arquivo[s]) rodados AGORA no seu commit: Test Files 4 passed (4);Tests 23 passed (23)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015224516_audio_memes_storage_paths.sql, supabase/tests/audio_memes_storage_paths.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:\.delete\(\)|\bDELET, padrão:auth\.(uid|role)\(\), padrão:cron\.schedule, padrão:requireRole|isAdmin|

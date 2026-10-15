Especialista: workersql

Refazer 1: os 3 pontos da recusa, com prova em PG 17 descartável (papel real, migrations reais, ROLLBACK no fim).

Ponto 1 — admin UPDATE/DELETE em stickers e custom-emojis. Diagnóstico confirmado por sonda (stub is_admin_or_supervisor=true só p/ ADMIN_UID): só com a migration de estado, admin UPDATE do catálogo = 1 linha; com a migration antiga (sem SELECT) = 0 linhas (UPDATE/DELETE exigem SELECT p/ enxergar a linha); admin DELETE de objeto de topo do catálogo = 0 antes e depois (policies de DELETE desses buckets são owner-only, sem ramo admin — inalteradas, sem regressão; gestão global via service_role/BYPASSRLS, B6). Fix na migration: 2 policies FOR SELECT TO authenticated restritas a admin — "Stickers: admin le o catalogo" e "Emojis: admin le o catalogo", USING (bucket_id + is_admin_or_supervisor(auth.uid())); Rollback ganhou o DROP das duas. Teste novo, bloco C: C1 admin ATUALIZA figurinha do catálogo = 1 (VERMELHO com migration antiga: `[FALHOU] C1`, aborta; a sonda mostrou UPDATE emoji = 0 e DELETE próprio = 0 no estado antigo); C2 admin ATUALIZA emoji = 1; C3 admin REMOVE figurinha da própria pasta = 1; C3b admin NÃO remove topo do catálogo = 0 (igual a antes, documentado); C4/C4b comum NÃO lista (0) e C4c comum NÃO atualiza (0); C5/C5b anon 0.

Ponto 2 — dono DELETE o próprio avatar. Nenhuma mudança de policy (DELETE do dono já existia + SELECT do dono da migration): só prova nova, bloco D — D1 dono REMOVE o próprio avatar = 1; D2 NÃO remove o alheio = 0. Verde na migration antiga e na nova (cobertura, sem regressão).

Ponto 3 — decisão e critério. Decisão: admin gerencia o catálogo via UPDATE (ramo admin no USING das policies de UPDATE, agora com SELECT de admin) + DELETE do que está na própria pasta; DELETE de topo segue owner-only como sempre foi (service_role p/ gestão global). Ressalva do critério "nenhum bucket público listável" ajustada: authenticated comum e anon continuam com 0 linhas nos 3 buckets (B2b, B3, B4, B5, C4, C5); só admin/supervisor enxerga stickers/emojis (predicado is_admin_or_supervisor), o que é gestão do catálogo, não listagem pública.

Arquivos (git diff --name-only dia/2026-10-15...HEAD):
.tmp/relato.md
supabase/migrations/20261013210001_storage_buckets_publicos_sem_listagem.sql
supabase/tests/storage_buckets_publicos_sem_listagem.sql

Prova: `psql -v mig_estado=20260511233306... -v mig_nova=20261013210001... < supabase/tests/storage_buckets_publicos_sem_listagem.sql` → 30 `[PASS]` (A1–A5, B1–B12, C1–C5b, D1–D2), zero FALHOU, `[OK] buckets publicos ... sem listagem e sem escrita fora do dono`. Rollback executado de verdade no PG descartável → `ROLLBACK-OK 4 abertas de volta` + `ROLLBACK-OK 3 novas sumiram`. Gatilhos: migration só cria/dropa policies em storage.objects (sem UPDATE/INSERT em dados, sem função/trigger/GRANT novo); efeito colateral: nenhum. `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (187s)` com `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations` (+ `AVISO banco_local NÃO VERIFICADO`, prova de banco feita no PG 17 descartável acima).

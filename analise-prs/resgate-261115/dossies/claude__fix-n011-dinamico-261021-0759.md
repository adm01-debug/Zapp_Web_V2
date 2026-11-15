# Dossiê — claude__fix-n011-dinamico-261021-0759 (PR #2147)

**Ref:** `origin/claude/fix-n011-dinamico-261021-0759` · tip `77de63cb9` · merge-base `d7af7a671` (2026-10-19) · 3 commits à frente.

## Propósito
Ajustar o guard de teste `scripts/db-audit/n011-storage-policies-dedup.test.mjs` (dedup de policies de
storage.objects, achado N-011): trocar o assert de "versão máxima absoluta" por um teto dinâmico por
domínio e alinhar as expectativas ao canônico atual dos buckets (commit `0913cfeb5`, 2026-10-21).
Os dois commits seguintes (`360ba6ccb`, `77de63cb9`, 2026-10-31) só resolvem conflito e **sincronizam
o arquivo com a `main`** ("sync n011-storage-policies-dedup.test.mjs com main").

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/n011-storage-policies-dedup.test.mjs` | BOTH_CHANGED / CONFLICT (2 linhas faltando, 3 "removidas ainda na main") | **Já na main.** `git diff origin/main <tip> -- <arquivo>` mostra um único hunk de 2 linhas: reformatação do comentário "(b) replay drifted: ... migration historica, aplica N-011 e prova / que ambos somem" → "migration historica de origem, / aplica N-011 e prova que ambos somem". Zero mudança de código. | diff tip×main acima (linhas 12-13 do arquivo); `git show origin/main:<arquivo>` linhas 1-17 |

As "3 linhas removidas ainda na main" do pré-check (`lerFix()`, `RE_DP`) são falso positivo do line_check:
o arquivo da main foi reescrito pelo #2156 (`4b9585052`, 2026-10-21, "Correções validadas de CI, segurança e
integrações") para prova OFFLINE lendo `supabase/migrations/` reais, e a branch foi sincronizada com essa
versão em `77de63cb9` — o conteúdo do tip é idêntico ao da main exceto o comentário.

A abordagem original da branch (teto dinâmico por domínio, `0913cfeb5`) foi **superada** pela reescrita
do #2156 (prova offline com replay limpo/drifted/idempotente); `git grep -i 'teto|dinamic'` na main não
encontra o conceito, e `git diff --stat 0913cfeb5 origin/main -- <arquivo>` = 249 linhas (reescrita).

## Verificação
- Worktree local em `dac285f62` == `origin/main`; `node scripts/db-audit/n011-storage-policies-dedup.test.mjs`
  → `# fail 0` (ver saída no resumo do agente).

## Veredito
**INCORPORADA** (confiança alta). A única diferença residual é redação de comentário (valor: nenhum).
Triagem anterior (2026-11-08) marcou OBSOLETA — compatível: o commit útil original foi substituído pelo
#2156 e a branch depois absorveu a main.

## Lacunas a recuperar
Nenhuma. Hunk residual (apenas para registro, não vale portar):
```
-//   (b) replay drifted: reintroduz os alvos da migration historica, aplica N-011 e prova
-//       que ambos somem sem alterar policies alheias;
+//   (b) replay drifted: reintroduz os alvos da migration historica de origem,
+//       aplica N-011 e prova que ambos somem sem alterar policies alheias;
```

**apagar_branch_seguro:** true.

## Reexame de commits intermediários

**Parecer: MISTO (quase todo REFATORACAO_INTERNA; sobra de valor baixo).** `apagar_branch_seguro` segue `true`.

### Quem removeu o quê
- `0913cfeb5` (2026-10-21, "guard n011 com teto dinamico por dominio e canonico atual") adicionou as 61
  linhas do achado (`REMOVIDAS`, `FINAL_AVATARS`, `SOZINHOS_1`, `AUDIO_MEMES_DELETE_FINAL`,
  `GUARD_BUCKETS` e o teste `o fix continua sendo o ultimo a tocar nas policies guardadas`).
- `360ba6ccb` (2026-10-31, "resolve conflito de merge — S3-014") não adicionou trabalho: trocou
  `txt.includes(\`"${n}"\`))` por `txt.includes(\`"${n}"\`)` — tirou um `)` e **quebrou a sintaxe** do
  arquivo (1 linha do achado). Entre `360ba6ccb` e `77de63cb9` o teste não parseava.
- `77de63cb9` (2026-10-31, "sync n011-storage-policies-dedup.test.mjs com main") é o removedor:
  substituiu o arquivo inteiro pela versão da main pós-#2156 (112 ins / 137 del).

### A intenção sobrevive na main?
Sim, no essencial. `git show origin/main:scripts/db-audit/n011-storage-policies-dedup.test.mjs`:
- L247 `test('migrations posteriores nao reescrevem policies de avatars')` — **teto dinâmico por domínio**,
  exatamente o que `0913cfeb5` queria no lugar do antigo assert de "versão máxima absoluta"
  (que era o `test('o fix e a migration de maior versao ...')` removido por `0913cfeb5`).
- L229-230 `AVATAR_SELECT_VIGENTE = 'avatars authenticated read'`, `AVATAR_DELETE_VIGENTE = 'Users can
  delete their own avatar'` (singular) — alinhamento ao canônico do bucket privado 20261009182648.
- L236 `['audio-memes','DELETE', ['Admins can delete any audio meme','Users can delete own audio memes']]`
  — o DELETE=2 (dono+admin, 20261016001136) que `0913cfeb5` introduziu.
- A prova é mais forte que a da branch: replay limpo + replay drifted + idempotência (L264-287), contra
  o rollback só "parseável" que `0913cfeb5` deixou.
- Verificação: worktree em `dac285f62` (== `origin/main`),
  `node scripts/db-audit/n011-storage-policies-dedup.test.mjs` → `# pass 15 / # fail 0`.

### O que não existe em lugar nenhum (resíduo, valor baixo)
1. **Amplitude do teto**: a main guarda só `avatars` (regex `\bavatars?\b`). A branch guardava 4 buckets
   (`GUARD_BUCKETS = ['avatars','stickers','audio-memes','custom-emojis']`) e também por **nome de policy**
   (`nomesGuardados`). `git grep 'GUARD_BUCKETS\|nomesGuardados\|citaGuardado' origin/main` → só docs de
   análise, zero código. Efeito prático: uma migration futura pode reescrever policy de
   stickers/audio-memes/custom-emojis sem o guard reclamar.
2. **Asserts de avatars INSERT/UPDATE** (`'avatars owner insert'` / `'avatars owner update'`, do
   `FINAL_AVATARS`). As policies existem na main (`supabase/migrations/20261009182648_avatars_bucket_private.sql`)
   mas nenhum teste da main as cobre.

Nada disso é proteção de produção desfeita: é cobertura de teste a mais, fora do escopo do achado N-011
(dedup de avatars). Porte, se quiser, como 3 linhas no teste da main — não precisa da branch.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** `apagar_branch_seguro` = true. Tentei refutar e não achei hunk de
valor ≥ médio fora da `main`.

### O que eu mesmo rodei (main = `dac285f62`, worktree `346c62601` com o arquivo idêntico à main)
1. `git diff --stat d7af7a671 origin/claude/fix-n011-dinamico-261021-0759 --name-status` → **1 arquivo só**
   (`M scripts/db-audit/n011-storage-policies-dedup.test.mjs`). Não há migration, workflow, `src/` ou edge
   escondido na branch.
2. `git diff origin/main origin/claude/fix-n011-dinamico-261021-0759 -- scripts/db-audit/n011-storage-policies-dedup.test.mjs`
   → **um único hunk, linhas 11-13**, só redação do comentário `(b) replay drifted ... migration historica
   de origem`. Zero diferença de código entre o tip e a main. As 2 linhas do `missing_sample` do JSON são
   exatamente esse comentário.
3. `git diff HEAD origin/main -- scripts/db-audit/n011-storage-policies-dedup.test.mjs` → vazio (o arquivo
   que rodei é o da main).
4. `node scripts/db-audit/n011-storage-policies-dedup.test.mjs` → `1..15 / # pass 15 / # fail 0`.
   Confirma o número da triagem.
5. O "commit útil" `0913cfeb5` pedia teto dinâmico por domínio no lugar do assert de versão máxima
   absoluta. A main tem isso em `scripts/db-audit/n011-storage-policies-dedup.test.mjs:247`
   (`test('migrations posteriores nao reescrevem policies de avatars')`, filtro
   `basename(a).split('_')[0] > versaoFix` + `create|drop|alter policy` + `on storage.objects`).
   Necessidade coberta.
6. Também confirmei na main o canônico que `0913cfeb5` queria: L229-230 (`avatars authenticated read`,
   `Users can delete their own avatar`) e L236 (`audio-memes/DELETE` = dono + admin).

### Os 2 resíduos do reexame: medi o impacto e dei valor BAIXO
- **Amplitude do teto (só `avatars` na main vs 4 buckets na branch).** Varri as migrations com versão maior
  que `20261016105108_n011_storage_drop_duplicate_avatar_policies.sql` que têm DDL de policy em
  `storage.objects`: `20261016112802_whisper_audio_path.sql` (`bucket_id='audio-messages'`),
  `20261113170400_reaplica_whatsapp_media_select_scope.sql` (sem `bucket_id`),
  `20261113171200_reaplica_parciais_comments_team_chat_delete.sql` (`bucket_id='team-chat-files'`).
  **Nenhuma toca avatars/stickers/audio-memes/custom-emojis** — as citações a "stickers"/"audio-memes"
  nessas duas são em comentário (linhas 25/28 e 42/43), fora de `bucket_id = '...'` e fora de nome de
  policy entre aspas duplas. Logo o guard largo da branch **passaria igual hoje**: a diferença é proteção
  prospectiva, não cobertura perdida. Valor baixo.
- **Asserts de `avatars` INSERT/UPDATE.** Confirmado ausente na main (nenhum assert de `avatars owner
  insert`/`avatars owner update`), mas é teste a mais fora do escopo do achado N-011 (dedup SELECT/DELETE).
  Valor baixo. Para quem quiser: 3 linhas no `SOZINHOS` da main, sem precisar da branch.

### Por que isso não vira PERDIDA_PARCIAL
Os dois resíduos **não estão no `git diff merge_base..tip`**: foram apagados pelo próprio commit de tip da
branch (`77de63cb9`, "sync ... com main", 112 ins/137 del). Apagar a ref não destrói nada que a ref ainda
carregue — ela carrega só o comentário reformatado. E `360ba6ccb` deixou o arquivo sem parsear (tirou um
`)`), então o estado intermediário da branch nem era executável. Nada de proteção de produção foi desfeito:
o diff `0913cfeb5` × main é troca de estratégia de teste (prova offline com replay limpo + drifted +
idempotência, mais forte que o rollback "parseável" da branch), não remoção de guard.

**Veredito final: INCORPORADA.** Única lacuna remanescente = redação de comentário (valor nenhum) + 2
resíduos de cobertura de teste de valor baixo, ambos portáveis sem a branch.

# Importação de áudios meme — Zapp Web V1 → V2

**Data:** 2026-09-03 · **Run:** manual, autorizada pelo Joaquim (exceção §16: planner/reviewer Claude no limite semanal até 06/09)

## Resultado
- **542/543** áudios importados do projeto V1 (`1d419c34...`, allrjhkpuscmgbsnmjlv) para o V2 (`tnnnlkbymytvtqngbbqh`)
- Bucket `audio-memes` V2: 542 objetos (~88 MB) · Tabela `public.audio_memes`: 542 linhas
- Verificação: 0 URLs apontando para V1 · URLs públicas V2 retornam HTTP 200 · MD5 5/5 amostras idênticas · 17 categorias preservadas

## Exceções (1 registro excluído)
- `beep-01a.mp3` ("Teste PTT Waveform"): URL externa soundjay.com (nunca esteve no storage V1), fonte retorna 404. Registro de teste — não importado.

## Conversões (3 arquivos, whitelist de MIME do bucket V2 não aceita os containers)
| Original | Motivo | Virou |
|---|---|---|
| `meme_mm_mm2_000_Rita_Lee_boazinha_chata_paca.mp4` | MIME audio/mp4 barrado (HTTP 415) | `...__conv.mp3` |
| `meme_mm_mm2_001_Rita_Lee_-_Ela___toda_boazinha.asf` | MIME video/x-ms-asf barrado | `...__conv.mp3` |
| `meme_mm_mm2_003_E_o_pix__nada_ainda_.m4a` | MIME barrado | `...__conv.mp3` |

Áudio preservado via ffmpeg libmp3lame -qscale:a 5. IDs e metadados da tabela mantidos.

## Padronização p/ compatibilidade celular (03/09, mesma run)
- Verificado com ffprobe: os 10 `.oga/.ogg` eram codec **Opus** — não toca em Safari/iOS < 18.4 (caniuse.com/opus).
- Convertidos para MP3 (`__conv.mp3`), subidos, OGG deletados do bucket, URLs atualizadas na tabela.
- **Estado final: 542 objetos, 100% `audio/mpeg`** — toca em qualquer celular (Android, iPhone de qualquer idade) e navegador.
- 406/542 registros têm `duration_seconds` null na V1 (já vinham assim).
- Whitelist do bucket NÃO foi alterada (update via API rejeita o próprio valor existente `audio/ogg;codecs=opus` — tocar nisso pode quebrar upload de PTT; decidido não mexer).
- Manifesto: `manifest_v1.json` · linhas inseridas: `insert_rows.json` · resultados upload: `upload_results.json` · arquivos locais: `files/` (87 MB)

## Rollback (completo)
```
# via gateway supabase-zapp-web-v2-mcp
storage_empty_bucket  {bucket: "audio-memes"}   # ou delete seletivo
db_delete             {table: "audio_memes", filtro id in manifest_v1.json}
```
Ambos os destinos estavam vazios antes da run — estado original = vazio.

## Ideia 2 — Conversão em tempo real no upload (03/09, run h438347)
- Nova util `src/utils/audioToMp3.ts`: Web Audio API + lamejs 1.2.1 (lazy CDN) → MP3 128 kbps mono antes do upload.
- Aplicada em `useAudioMemes.ts` (painel atendente) e `useMediaUpload.ts` (bulk admin). Fallback: arquivo original se browser não decodificar.
- Bonus: renomeados 25 `.mpga` → `.mp3` no bucket + URLs (Ideia 1 completa: 542 objetos 100% audio/mpeg, 0 URLs sem .mp3).
- Dry-run lamejs validado com ffprobe. Gates locais: build OK · vitest 2530 OK · ratchet 0 novas OK.
- CI do PR #175 100% verde (Lint&TypeCheck, Build, Unit Tests, Security Audit, Vercel). PR draft aguardando revisao/merge.
- Commits: b3ba6cc + b9345de (fix ratchet set-state-in-effect pre-existente).

## Auditoria adversarial (03/09, 5 agentes + arbitro)
- MD5 542/542 idênticos local vs URL pública V2 (rounds 415+127, rate-limit contornado).
- Agente DB: 0 achados (count 542, PK única, manifesto V1 casando campo a campo).
- Agente Storage: 0 achados (542 objetos, 100% audio/mpeg, 0 órfãos, 0 dryrun, HEAD 20/20 OK).
- Agente Code Review: 1 achado ALTA — race no lazy-load do lamejs (Promise nunca resolvia em chamadas concorrentes). CORRIGIDO: commit 115b72b (Promise compartilhada) + 48a894a (tipo LamejsModule, TS2322 do CI).
- Agente E2E Browser: conversão validada em Chromium real (decode→encode lamejs→MP3 válido; fallback em bytes inválidos retorna null).
- Agente Paridade/Produção: 0 divergências campo a campo (542, 13 conv, 25 mpga, 504 diretas); app + RPC + edge function respondendo.
- CI PR #175: 100% verde após fixes (Lint&TypeCheck, Build, Unit Tests, Security Audit, Vercel).

## Auditoria — rodada 2 de correções (03/09, commits 59dbda7)
Code review adversarial completo: 3 ALTA + 5 MÉDIA + 5 BAIXA. Corrigidas todas ALTA/MÉDIA:
- ALTA-1 CDN: lamejs agora self-hosted /vendor/lamejs-1.2.1.min.js (SHA-256 15d285e2... = CDN)
- ALTA-2 tamanho: check pós-conversão nos 2 fluxos (5MB painel / MAX_UPLOAD bulk)
- ALTA-3 UI/memória: yield a cada 200 blocos, arrayBuffer liberado p/ GC, NaN→0, máx 10min
- MÉDIAs: resultado discriminado (ok|decode-failed|too-long|encoder-unavailable), duration local CBR, resume() iOS, fallback <audio> só se duration null
- BAIXAs avaliadas e aceitas (SRI desnecessário p/ same-origin, resample linear ok p/ voz, etc.)
CI PR #175: 100% verde (Lint&TypeCheck ✓ Build ✓ Unit Tests ✓ Security ✓ Vercel ✓)
Outros agentes: DB 0 críticos (nota média: SELECT policy using=true — biblioteca compartilhada, aceitável); Storage 0 críticos (nota média: cacheControl=no-cache nos 542 — oportunidade de otimização, não corrigido: exigiria update em massa); Paridade 0 divergências (use_count 16→17 orgânico pós-import); E2E browser: encode 3s=90ms, 30s=503ms, fallback OK.

## Sincronização GitHub + banco canônico (03/09)
- PR #175 MERGEADO (squash 6b5a454) → main atualizado com conversão MP3 client-side
- PR #177 MERGEADO (squash fa0a305) → arquivo da migration 20260903135434 no repo (drift fechado)
- ops.hermes_change_log criado e vivo: 3 runs registradas (ids 2-4, status=verificado, todos os campos jsonb completos)
- Deploy Vercel: HTTP 200; /vendor/lamejs-1.2.1.min.js servido com SHA-256 idêntico ao CDN
- DB Live Guard no main: vermelho PRÉ-EXISTENTE desde 02/09 (drifts 20260902000200/300/500/600 de outros PRs) — meu drift foi o único fechado

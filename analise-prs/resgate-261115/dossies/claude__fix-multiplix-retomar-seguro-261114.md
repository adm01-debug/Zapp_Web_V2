# Dossiê — claude__fix-multiplix-retomar-seguro-261114 (PR #3089)

**Ref:** `origin/claude/fix-multiplix-retomar-seguro-261114` · tip `941d989d` · merge-base `33ed0eaa` (2026-11-14)
**Veredito:** INCORPORADA (confiança alta) · apagar branch: SEGURO

## Propósito
Multiplix: "Retomar" confirma a retomada pela transição de status (paused → sending) com espera limitada, em vez de esperar o worker processar o lote (gateway corta em ~150 s); disparo legado pausado SEM fila (`pause_reason = legacy_queue_unmaterialized`) deixa de mostrar "Retomar" e passa pelo "Iniciar" com confirmação; o banco (migration `20261114130000`) e o worker recusam o atalho (`multiplix_dispatch_confirm_required`). Commits: `fa33d8f8`, `4e12140b`, `08d727fe` + 2 merges de main.

Integrada na main pelo pacote 6 (`41853318c`, #3113); depois a main seguiu adiante (pacote 8 `2cf0153ae`, #3135).

## Arquivo × achado × evidência
| Arquivo | Pré-classificação | Achado | Evidência |
|---|---|---|---|
| 13 arquivos (`MultiplixView.tsx`, 3 testes `src/`, `multiplixActionErrors.ts`, `multiplixResume.ts`, `useMultiplixDispatches.ts`, migration `20261114130000_*.sql`, `db-audit/*.test.sh`, `regras.md`) | IDENTICAL_TO_MAIN / PRESENT_BYTE | idênticos na main | status mecânico do JSON |
| `db-guard.yml`, `ESTADO.md`, `multiplix-send/index.ts`, `multiplix-send/index.test.ts` | PRESENT_REVERSE_APPLIES | hunks da branch estão na main; `index.ts` da main tem ainda +15 linhas (C121 `instance_paused`, `isInstancePaused`) que vieram depois | `git diff <branch> origin/main -- supabase/functions/multiplix-send/` = só adições da main |
| `src/components/multiplix/MultiplixMonitor.tsx` | CONFLICT (2 linhas "faltando") | **Já está na main.** As 2 linhas "faltantes" (botões Retomar/Iniciar) diferem SÓ na classe CSS `text-primary-glow` → `text-[hsl(var(--primary-text))]`, troca de tema feita pela main no pacote 8 (`2cf0153ae`). Toda a lógica (`isLegacyUnqueued`, `needsConfirmToStart`, `confirmResumeByStatus`, `LEGACY_UNQUEUED_PAUSE_REASON`, toast por `outcome.kind`) existe na main | `git diff <branch> origin/main -- MultiplixMonitor.tsx` = 4 hunks, todos troca de classe de cor; `origin/main:MultiplixMonitor.tsx:311-334, 394-395, 442, 444`; `git log -S'text-primary-glow' origin/main -- MultiplixMonitor.tsx` → `2cf0153ae` |
| `supabase/deployment-manifest.json` | CONFLICT (4 linhas) | **Obsoleto, não lacuna.** Hashes da branch (`bytes 66698`, sha `5e71ccc7…`, source `11e576b6…`) apontam para a versão antiga de `multiplix-send/index.ts`. A main regenerou o manifest para a versão atual: `bytes 67219`, sha `561ee437…` = `sha256sum` real de `origin/main:supabase/functions/multiplix-send/index.ts` (67219 bytes) | `origin/main:deployment-manifest.json:773-775, 2336, 2814`; `git show origin/main:…/index.ts \| sha256sum` = `561ee437fcc21bfa…` |

## Banco (produção, só leitura)
`select version,name from supabase_migrations.schema_migrations where version='20261114130000'` → 1 linha: `multiplix_start_exige_confirmacao` (aplicada em produção).

## Lacunas a recuperar
Nenhuma. Nada a portar.

## Verificação adversarial
Parecer: **concordo com INCORPORADA**. Tentei refutar hunk por hunk e não achou-se nenhuma lacuna de valor ≥ médio.

Base: `origin/main` em `dac285f62`, merge-base `33ed0eaa9c`, tip da branch `941d989d23`.

Prova por arquivo (os 2 que a varredura automática marcou com lacuna):
- `src/components/multiplix/MultiplixMonitor.tsx` — as 2 linhas tidas por ausentes são os dois botões. Estão na main, com diferença só de token de tema (`text-primary-glow` da branch → `text-[hsl(var(--primary-text))]` na main, mudança POSTERIOR da main): `git show origin/main:src/components/multiplix/MultiplixMonitor.tsx | grep -n` → 442 (`{isPaused && !isLegacyUnqueued && …Retomar}`) e 444 (`{needsConfirmToStart && …Iniciar}`); além disso 13-14 (imports `multiplixActionErrors`/`multiplixResume`), 87 (`LEGACY_UNQUEUED_PAUSE_REASON`), 316 (`confirmResumeByStatus`), 329 (`multiplixActionErrorCode(...) === 'multiplix_dispatch_confirm_required'`), 394-395 (`isLegacyUnqueued`/`needsConfirmToStart`), 482 (aviso do legado sem fila). As 2 linhas "removidas mas ainda na main" (`toast.success('Disparo retomado');`, `} catch (e) {`) são genéricas e existem em outro contexto — não indicam reversão.
- `supabase/deployment-manifest.json` — as 4 linhas ausentes são só hashes/bytes do snapshot da branch (`bytes: 66698`, `sha256 5e71ccc…`, `source_sha256 11e576b…`, `manifest_sha256 a2e6010…`). A main tem o manifesto regenerado depois (`source_sha256 881592b8…`, `manifest_sha256 def318ea…`) porque `multiplix-send/index.ts` seguiu evoluindo (67219 bytes na main). Portar os hashes antigos QUEBRARIA o guard. Valor zero.

Os outros arquivos BOTH_CHANGED, conferidos na main:
- `supabase/functions/multiplix-send/index.ts` — guard do §8 presente: linhas 320/326/328 (`multiplix_dispatch_confirm_required`, `pause_reason === "legacy_queue_unmaterialized"`, 409) e 396 (comentário da 20261114130000).
- `supabase/functions/multiplix-send/index.test.ts` — presente e ampliado: `transitionStartError` (194) e os três testes §8 (893, 904, 918).
- `.github/workflows/db-guard.yml` — step presente: linha 688 roda `supabase/tests/db-audit/multiplix-start-exige-confirmacao.test.sh`.
- `ESTADO.md` — arquivo é gerado; a main tem a tabela regenerada (`useMultiplixDispatches.ts:134`, linha 100), mesma informação.
- Migration `20261114130000_multiplix_start_exige_confirmacao.sql` e o teste `.test.sh` existem na main (`git ls-tree origin/main`).

Teste decisivo (direção do delta): `git diff --stat origin/main origin/claude/fix-multiplix-retomar-seguro-261114` nos 16 arquivos → todo o delta restante é a main ADIANTE da branch (token de tema, feature C121 `instance_paused` no worker, manifesto regenerado, mais steps no db-guard, ESTADO regenerado). Reaplicar a branch hoje seria REGRESSÃO (reverteria o C121 e o tema).

Apagar a branch é seguro.

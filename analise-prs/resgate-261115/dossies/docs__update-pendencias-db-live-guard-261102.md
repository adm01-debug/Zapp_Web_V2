# Dossiê — docs__update-pendencias-db-live-guard-261102 (PR #2577)

**Ref:** `origin/docs/update-pendencias-db-live-guard-261102` · tip `ed50aa9f` · merge-base `8ba0b436` (2026-11-02)
**Commit único:** `ed50aa9f3 docs: atualizar PENDENCIAS.md §1 com run 41385849215 (6 falhas) e §3 com PR #2567`
**Escopo:** só `PENDENCIAS.md` (+43/−32). Zero src/edges/migrations/workflows.

## Propósito
Snapshot de status de 2026-11-02T04:06Z do arquivo PENDENCIAS.md: atualizar §1 (DB Live Guard run 41385849215 com 6 falhas, types-sync disparado), §3 (Deploy Edge Functions: fix `--frozen=false` da PR #2567 aguardando verificação) e §4 (passos do gate `producao-ddl` no `db-migrate.yml`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `PENDENCIAS.md` | OBSOLETA — o arquivo foi reescrito do zero na main; o snapshot de 02/11 não faz mais sentido | `git log 8ba0b436..origin/main -- PENDENCIAS.md` = 18 commits posteriores (de `3b044f840` 2026-11-02 a `1d4702804` 2026-11-15). Cabeçalho atual: `# PENDÊNCIAS CI — 2026-11-12` (`origin/main:PENDENCIAS.md:1`), 445 linhas, estrutura totalmente diferente (tabela de prova + §1..§5 novos). |
| §1 DB Live Guard "6 falhas, investigação pendente" | Superado: main registra o workflow como resolvido | `origin/main:PENDENCIAS.md:18` — `DB Live Guard | #42678012070 | Resolvido em sessão anterior | conclusion=success confirmado` |
| §1 passo "Verificar frescor do types.ts" / types-sync disparado | Superado | `origin/main:PENDENCIAS.md:121` — `types-sync | #43204745973 | completed | ✅ success` |
| §3 Deploy Edge Functions "fix --frozen=false aguardando verificação" | Superado: o fix está no workflow e o deploy está verde | `origin/main:.github/workflows/deploy-functions.yml:488` — `cd supabase/functions && deno install --frozen=false`; `origin/main:PENDENCIAS.md:116` — `Deploy Edge Functions | #43189662194 | completed | ✅ success` |
| §4 passos do gate `producao-ddl` | Superado por texto mais recente sobre o mesmo tema | `origin/main:PENDENCIAS.md:150-153` — seção "1. Migrations novas esperando o apply no banco" com a lista atual de migrations pendentes e o aviso de drift do `db-live-guard` |

Tip `ed50aa9f` não é ancestral de `origin/main` (`git merge-base --is-ancestor` → NO): o texto nunca entrou byte a byte, mas a necessidade que ele atendia (registrar o estado dos workflows em 02/11) foi atendida por 18 versões posteriores do mesmo arquivo.

## Veredito
**OBSOLETA** (confiança alta). Documento de estado datado; cada fato que ele registrava (run 41385849215, types-sync disparado, PR #2567 não verificada) já foi substituído na main por fatos mais novos que mostram os mesmos workflows verdes. Nenhum hunk tem valor a portar — portar reintroduziria informação falsa (ex.: "DB Live Guard com 6 falhas") num arquivo que hoje afirma o contrário.

Confirma a triagem anterior (2026-11-08: OBSOLETA).

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

---

## Verificação adversarial

Parecer: **concordo — OBSOLETA**, `apagar_branch_seguro = true`. Tentei refutar procurando hunk de valor
≥ médio não coberto pela main. O diff tem 3 blocos; nenhum sobrevive.

**Hunk 1 — §1 DB Live Guard (run 41385849215, 6 falhas, types-sync disparado).** Conteúdo datado de
2026-11-02T04:06Z. A main contradiz: `origin/main:PENDENCIAS.md:18` = `DB Live Guard | #42678012070 |
Resolvido em sessão anterior | conclusion=success confirmado`; `origin/main:PENDENCIAS.md:121` =
`types-sync | #43204745973 | completed | ✅ success`. Portar reintroduz fato falso.

**Hunk 2 — §3 Deploy Edge Functions (fix `--frozen=false` da PR #2567, "verificação pendente").** O fix
está na main com comentário explicativo: `origin/main:.github/workflows/deploy-functions.yml:478,482,488`
(`cd supabase/functions && deno install --frozen=false`). A verificação que a branch pedia já ocorreu:
`origin/main:PENDENCIAS.md:116` = `Deploy Edge Functions | #43189662194 | completed | ✅ success`.

**Hunk 3 — §4 "Gate de apply ainda pendente (Joaquim)", 5 passos do `producao-ddl`.** Este era o único
candidato com valor durável (runbook, não status). Está coberto em três lugares da main, com mais
detalhe que a branch:
- `origin/main:docs/MIGRATIONS.md:508-515` — os 5 passos (merge → dry-run `apply=false` com SHA-256
  estrutural → aprovação humana no environment `producao-ddl` → `apply=true` com
  `confirm_runtime_sha256` do dry-run → types-sync).
- `origin/main:docs/agentes/banco.md:56-62` — mesmo fluxo, mais o aviso **NÃO VERIFICADO ponta a ponta**
  e a limitação de o workflow conectar como `postgres` (não superuser).
- `origin/main:.github/workflows/db-migrate.yml:21` (comentário de cabeçalho: "pausa em 'Waiting' no
  environment producao-ddl ate aprovacao humana") e `:75` (`environment: producao-ddl` no nível do job,
  logo vale para qualquer dispatch, dry-run incluído — exatamente a afirmação da branch, documentada na
  fonte). Nada a portar.

**Checagens de contexto.** `git merge-base --is-ancestor ed50aa9f origin/main` → NÃO-ANCESTRAL (o texto
nunca entrou byte a byte). `git log 8ba0b436..origin/main -- PENDENCIAS.md` → 18 commits, de
`3b044f840` (2026-11-02) a `1d4702804` (2026-11-15); o arquivo foi reescrito (`origin/main:PENDENCIAS.md:1`
= `# PENDÊNCIAS CI — 2026-11-12`, 445 linhas). Não houve remoção deliberada do conteúdo da branch: o
`3b044f840` tomou outro rumo para o mesmo §1 ("novos bloqueios db-live-guard run #1421"), e o gênero
"snapshot datado" foi arquivado (`c570d5d46` "arquiva prosa morta em docs/_arquivo"; a versão anterior
sobrevive como `origin/main:docs/ci/PENDENCIAS.md`, datada 2026-10-31).

Zero lacunas adicionais. Nenhum arquivo do repo foi tocado nesta verificação (git só leitura).

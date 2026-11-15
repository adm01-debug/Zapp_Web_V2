# Dossiê — `claude/wizardly-meitner-aejx3i`

- **Ref:** `origin/claude/wizardly-meitner-aejx3i` · **tip** `51fdf980a` (2026-10-31) · **merge_base** `7275a0703` (2026-10-30) · 21 commits à frente
- **PRs com este tip:** nenhuma. **Pré-classificação mecânica:** MISTO_CONFLITO (75 arquivos, 8.468 linhas em lacuna)
- **Veredito: OBSOLETA** · `apagar_branch_seguro = true`

## Propósito
Diário de bordo de uma sessão `/merge-prs` de 30–31/10/2026. Todos os 21 commits são `chore(analise)`/`docs(analise-prs)`
registrando progresso de merge do backlog de PRs **#2111–#2411** (ex.: `6a8347409 chore(analise): atualiza progresso -
lote 2 CI dispatched (01:47Z), 6 merges`; `51fdf980a chore(analise): PR #2411 mergeado 04:19Z`).

**100% dos 75 arquivos estão em `analise-prs/`.** Zero arquivo em `src/`, `supabase/`, `api/`, `server/`, `e2e/`,
`scripts/`, `.github/`. Nenhuma migration, edge function, workflow, teste ou config.
`git diff --stat 7275a0703 origin/claude/wizardly-meitner-aejx3i` → `75 files changed, 9801 insertions(+), 2722 deletions(-)`, todos sob `analise-prs/`.

## Por que é obsoleta — duas provas independentes

**1. O objeto da análise não existe mais.** `analise-prs/` é um diretório de estado de sessão: inventário das PRs
**abertas naquele momento** e a decisão de merge de cada uma. Consulta ao vivo (GitHub GraphQL,
`pullRequests(states:OPEN)`) → `totalCount: 0`. Nenhuma PR aberta no repo hoje; as 198 PRs dossiadas (#2111–#2411)
foram todas mergeadas ou fechadas nas duas semanas seguintes. Os 70 dossiês `PR-NNNN.md` são fotografias de
`mergeable_state`/`head SHA` de 30/10 — dados mortos por construção.

**2. A `main` já carrega uma geração mais nova dos mesmos arquivos.** O diretório é reescrito inteiro a cada sessão;
último toque na `main`: `d084ca753` (2026-11-14, "pacote 4 — #3048…#3058"), 15 dias depois do tip desta branch.

| Arquivo | Estado na branch (30–31/10) | Estado na `main` hoje | Evidência |
|---|---|---|---|
| `analise-prs/RELATORIO_PRS.md` | sessão de 26–31/10, 4 merges, "126 PRs bloqueadas pelo CI Gate" | sessão de 11–12/11, 30 PRs #2553–#2974 | `git show origin/main:analise-prs/RELATORIO_PRS.md:1` = "# Relatório /merge-prs — Zapp Web V2 (sessão de 11–12/11/2026)" |
| `analise-prs/progresso.json` | lotes de CI de 31/10 | `"sessao":"claude/intelligent-wright-oto3y0"`, `"atualizado":"2026-11-12T08:20Z"` | `git show origin/main:analise-prs/progresso.json` |
| `analise-prs/prs.json` / `prs.csv` | inventário de #2111–#2411 | inventário da sessão de 11–12/11 | `BOTH_CHANGED`; ambos regerados |
| `analise-prs/dossies/PR-2111…PR-2411.md` (70 arq.) | 70 dossiês novos | `main` tem `dossies/pr-2553.md … pr-2973.md` (convenção minúscula) | `git ls-tree -r --name-only origin/main -- analise-prs` (37 arquivos, nenhum `PR-` maiúsculo) |
| `analise-prs/all_prs_raw.json`, `prs_inventory.json` | dumps brutos da API (2.321 + 2.176 linhas) | ausentes — artefato gerado, não versionado na geração atual | `NEW_FILE_ABSENT_IN_MAIN` |
| `analise-prs/baseline/README.md` | baseline de `main@6090b6cdc` com typecheck/lint "FAIL (ambiente)" | `main` tem `analise-prs/baseline/main.json` | baseline de SHA de 30/10 = inútil |
| `analise-prs/regras-de-negocio.md` | 332 linhas: reescrita de "regras de merge" → **regras de domínio** | 53 linhas, volta a ser critério de merge | ver abaixo |

## O único arquivo com conteúdo durável — e por que também está coberto

`analise-prs/regras-de-negocio.md` foi reescrito na branch (167 → 332 linhas) deixando de documentar critério de
merge e passando a documentar **regras de domínio**: Contatos (visibilidade, legados, cache, notas fixadas),
Inbox (`contacts.conversation_status`, chips, snooze, auto-fechamento, presets), TalkX (blacklist sem deleção
física, snapshot X017, motor V24, horário de verão, revisão otimista), Team Chat (tabelas, realtime, RPCs),
RADAR (B·R·I·N·D·E, estágios, termômetro, pontuação CV-111), Auth/RLS, Evolution GO, migrations, `dashboard_kpi`.

Não é trabalho perdido — é documentação **derivada de código que continua na `main`**, e a mesma informação já é
publicada por duas fontes vivas:

- `docs/agentes/regras-dominio.md` na `main` (36 linhas, curado pelo dono: fixtures de E2E, decisão D4 de contato
  visível, convites `department_invitations`, token `--inbox-panel-bg`) — é o arquivo que o `AGENTS.md` manda ler.
- Branch gerada `contexto`, regerada a cada 10 min: `docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md` (**5.459 linhas**:
  `conversation_status` em "4.1 Conversa", enums `BrindeLetter`, schemas Zod do copiloto, triggers, fórmulas) e
  `docs/contexto/regras/10-ACESSO-E-SEGURANCA.md` (**1.241 linhas**: matriz RLS tabela × operação, `SECURITY DEFINER`,
  edges públicas, LGPD). Cobertura verificada: `git show origin/contexto:docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md | grep -i brinde`
  → linhas 1278, 1746, 1793, 1807, 2016, 2048.
- O código citado pelo doc segue vivo: `git grep -l purchaseSignalWeight origin/main -- src` →
  `src/hooks/copilot/useLiveScoring.ts`.

Portar as 332 linhas para a `main` reintroduziria um terceiro documento de regras, congelado em 30/10, competindo
com duas fontes atualizadas automaticamente — churn, não ganho.

## Lacunas e valor
Nenhuma lacuna de valor para o negócio. As 8.468 linhas em lacuna são, por categoria:
- 70 dossiês + 2 dumps de API + baseline (≈7.900 linhas): relatório de PRs que não existem mais → valor **nenhum**.
- 4 arquivos de estado de sessão (`RELATORIO_PRS.md`, `progresso.json`, `prs.json`, `prs.csv`): sobrescritos por
  geração mais nova → valor **nenhum**.
- `regras-de-negocio.md` (226 linhas): documentação duplicada por `docs/contexto/regras/` e `docs/agentes/regras-dominio.md` → valor **baixo**, não recuperar.

Nada a recuperar. Nenhum hunk a portar. Branch pode ser apagada.

## Verificação adversarial

Veredito da triagem **OBSOLETA — CONFIRMADO**. Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

**Perímetro (confirmado):** `git diff --name-only 7275a0703 origin/claude/wizardly-meitner-aejx3i | awk -F/ '{print $1}' | uniq -c` → `75 analise-prs`. Zero arquivos em `src/`, `supabase/`, `api/`, `server/`, `e2e/`, `scripts/`, `.github/`. Os 21 commits são todos `chore(analise)`/`docs(analise-prs)`.

**Evidência nova, mais forte que a da triagem:** a própria main já arquivou toda essa geração de `analise-prs/` como prosa morta — `c570d5d46` (PR #2630, 2026-11-02) "chore: arquiva prosa morta em docs/_arquivo (fase B)". `git ls-tree -r origin/main -- docs/_arquivo/analise-prs` → 211 arquivos, 196 deles dossiês `PR-NNNN.md` (mesma convenção maiúscula da branch). A branch tem 199 dossiês; `comm` dos basenames mostra **17 dossiês exclusivos da branch**: PR-2343, 2354, 2357, 2372, 2380, 2381, 2383, 2384, 2386, 2388, 2389, 2396, 2397, 2407, 2408, 2409, 2411. Abri PR-2372, PR-2411 e PR-2397: todos veredito `BLOQUEADO_CI` de 31/10, PRs docs-only (`PENDENCIAS.md`, `docs/ci/RELATORIO_CI.md`, `analise-prs/progresso.json`). Nenhum descreve código a recuperar.

**`regras-de-negocio.md` — único candidato a conteúdo durável, refutado por dois caminhos:**
1. Mergear seria **regressão** no caminho: `origin/main:analise-prs/regras-de-negocio.md` (53 linhas) é a especificação de regras de merge de PRs; a versão da branch (332 linhas) apaga esse conteúdo e avisa "Para regras de merge de PRs, veja a versão anterior".
2. A geração mais nova do mesmo documento já está na main, arquivada: `origin/main:docs/_arquivo/analise-prs/regras-de-negocio.md` (186 linhas, cabeçalho "**Gerado em:** 2026-11-02 | **main SHA:** `c4280ef4c`") — 3 dias mais nova que a da branch ("Gerado em: 2026-10-30 | SHA main: 6090b6c").
3. Cada fato de domínio citado na versão da branch tem fonte viva na main: `contact-show-legacy` + `CONTACT_VISIBLE_PHONE_PATTERN` em `docs/agentes/regras-dominio.md`; teto de 20 presets em `supabase/migrations/20261026190300_saved_filters_inbox_limites.sql:65-66`; notas fixadas em `supabase/migrations/20261026200000_contact_notes_pinned.sql`; `talkx_blacklist_no_delete` em `origin/contexto:docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md` (5.459 linhas); B·R·I·N·D·E em `docs/copiloto/CV-005-brinde-spec.md`; `zapp:inbox:conversation-tab` em `src/hooks/inbox/useInboxUIState.ts`. Documento 100% derivado de código que segue na main.

**Correção de uma evidência da triagem:** o "GraphQL states:OPEN → totalCount 0" está desatualizado. Agora `totalCount: 2` — PRs #3139 e #3140, ambas criadas em 2026-11-15 pelo próprio fluxo de resgate (`claude/feat-radar-live-mount-261115-1302`, `claude/fix-pacote-resgate-261115-1315`). Nenhuma delas está na faixa #2111–#2411, então a substância do argumento (backlog dossiado extinto) continua válida.

**Conclusão:** nenhuma lacuna. Apagar `origin/claude/wizardly-meitner-aejx3i` não perde valor de negócio.

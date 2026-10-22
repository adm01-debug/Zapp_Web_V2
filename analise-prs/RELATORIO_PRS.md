# Relatório de Análise — 30 PRs Abertas

**Data:** 2026-10-22  
**Main SHA:** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`  
**Branch de trabalho:** `claude/busy-cannon-40szm9` (commit `c68a8e590`)  
**Analista:** Claude Sonnet 4.6 — sessão `3677075d`

---

## META — RESUMO DE ENTREGA

| Métrica | Valor |
|---|---|
| **Total de PRs abertas** | 30 |
| **Total analisadas** | 30 |
| **CI-FALHA** (válidas, bloqueadas por CI vermelho na main) | 6 |
| **REJEITAR** (conteúdo inválido para este projeto) | 24 |
| **MERGEADAS nesta sessão** | **0** |

**Por que 0 merges:** O bloqueio é estrutural e pré-existente — ver seção "BLOQUEIO ESTRUTURAL" abaixo. Nenhuma das 30 PRs causou as falhas na main; elas existem desde pelo menos 2026-10-17 conforme logs de CI.

**Worktrees:** nenhum criado nesta sessão (`git worktree list` = apenas `/home/user/Zapp_Web_V2`).

**Outras escritas no GitHub:** nenhuma (zero push em main, zero fechar/comentar/labeling de PR, zero mudança de configuração).

**Arquivos entregues:**
- `analise-prs/baseline/build.txt` — baseline build da main
- `analise-prs/baseline/lint.txt` — baseline lint da main
- `analise-prs/baseline/typecheck.txt` — baseline typecheck da main
- `analise-prs/baseline/tests.txt` — 86 arquivos de teste com falha nos 3 shards (jobs 119760268054/267990/268115)
- `analise-prs/regras-de-negocio.md` — 9 regras extraídas de CLAUDE.md e branch protection
- `analise-prs/prs.json` — 30 PRs com veredito, critérios e motivo de bloqueio
- `analise-prs/prs.csv` — 30 linhas CSV com mesmo conteúdo
- `analise-prs/progresso.json` — progresso por PR
- `analise-prs/dossies/PR-2149.md` ... `PR-2186.md` — 30 dossiês com diff 100% lido, merge test local, análise dos 4 critérios e veredito

---

## ⚠️ RISCOS E DECISÕES HUMANAS

### BLOQUEIO ESTRUTURAL — NENHUMA PR PODE SER MERGEADA HOJE

**Causa:** Os required checks `🧪 Unit Tests` (×3) e `Contrato DB offline` falham na própria `main` (SHA `5a4632c`) com 86 arquivos de teste falhando (pré-existente). Com `strict=true` na branch protection, toda PR que tenta o merge herda essas falhas e é bloqueada pelo GitHub.

**O que o Joaquim precisa decidir:**
1. **Corrigir os 86 arquivos de teste falhos na main** antes de qualquer merge ser possível — ou
2. **Afrouxar temporariamente o `strict`** (histórico mostra que isso já foi feito antes, mas foi revertido como "REVOGADO" em 02/10).

Sem uma das duas ações, **nenhuma das 30 PRs pode ser mergeada** independentemente da qualidade do conteúdo.

### AÇÃO ESPECÍFICA NECESSÁRIA — 4 PRs com conteúdo válido bloqueado por CI externo

As PRs 2149, 2151, 2152, 2155 passam nos 4 critérios de análise mas estão presas no mesmo CI vermelho. Após a correção do CI da main, essas 4 precisam ser reavaliadas para merge.

### PR-2185 — Arquivo de teste deletado

`src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` (371 linhas) foi deletado. O arquivo cobre funcionalidade ativa (`useTalkXSuppression` usado em `TalkXSuppression.tsx`). **Decisão de negócio necessária:** manter o teste ou encerrar a funcionalidade?

### PR-2186 — Migration com DROP POLICY

`20261026100300_dept_invites_ownership_fix.sql` usa `DROP POLICY IF EXISTS` ×2. Se a intenção é corrigir ownership de convites de departamento, a migration precisa ser reescrita como aditiva (criar policies novas com nomes diferentes, sem dropar as existentes).

---

## PRs MERGEADAS NESTA SESSÃO

**Nenhuma.** Todas as 30 PRs estão bloqueadas — ver seção "BLOQUEIO ESTRUTURAL" acima.

---

## PRs PRONTAS PARA MERGE (aguardando CI verde na main)

| # | Título | Branch | SHA | Bloquio |
|---|--------|--------|-----|---------|
| [#2149](https://github.com/adm01-debug/Zapp_Web_V2/pull/2149) | docs(reconciliation): P053 | `claude/docs-p053-regressao-261021-0827` | `d78360c437` | CI main vermelho |
| [#2151](https://github.com/adm01-debug/Zapp_Web_V2/pull/2151) | fix(ci): destravar workflows | `fix/ci-workflows-vermelhos` | `0770f6b5ef` | CI main vermelho |
| [#2152](https://github.com/adm01-debug/Zapp_Web_V2/pull/2152) | test(e2e): spec de toque 44px | `claude/test-toque44-seletores-261021-0853` | `3eca130737` | CI main vermelho |
| [#2155](https://github.com/adm01-debug/Zapp_Web_V2/pull/2155) | fix(ci): destrava workflows v2 | `fix/ci-verde-261021` | `6493401` | CI main vermelho |

Todas as 4 passam nos critérios: válidas, sem regressão, não implementadas na main, regra de negócio correta. O único bloqueio é o CI vermelho pré-existente na `main`.

---

## PRs A FECHAR (conteúdo inválido — 26 PRs)

### Grupo B — 24 PRs: workflows para stacks erradas (sem ação de merge necessária)

Todas as 24 PRs do Grupo B adicionam workflows do GitHub Actions para tecnologias que **não existem neste projeto** (PHP, Python, Java, Rust, R, Go, Docker, Puppet, Next.js, npm publishing, SLSA) ou duplicam funcionalidade já existente no `ci.yml`. Adicionalmente, **todas violam `sha_pinning_required=true`** usando `@vN` em vez de SHA de 40 caracteres.

| # | Título | Motivo de rejeição |
|---|--------|-------------------|
| [#2157](https://github.com/adm01-debug/Zapp_Web_V2/pull/2157) | Add Dependency Review Action workflow | Stack errada + SHA pinning ausente |
| [#2159](https://github.com/adm01-debug/Zapp_Web_V2/pull/2159) | Add Bearer workflow | Bearer é para PHP/Go; secret ausente |
| [#2160](https://github.com/adm01-debug/Zapp_Web_V2/pull/2160) | Add Hadolint workflow | Sem Dockerfile neste projeto |
| [#2161](https://github.com/adm01-debug/Zapp_Web_V2/pull/2161) | Add puppet-lint workflow | Puppet inexistente |
| [#2162](https://github.com/adm01-debug/Zapp_Web_V2/pull/2162) | Add PHPMD workflow | PHP inexistente |
| [#2163](https://github.com/adm01-debug/Zapp_Web_V2/pull/2163) | Add lintr workflow | R inexistente |
| [#2164](https://github.com/adm01-debug/Zapp_Web_V2/pull/2164) | Add rust-clippy workflow | Rust inexistente |
| [#2165](https://github.com/adm01-debug/Zapp_Web_V2/pull/2165) | Add PMD workflow | Java/PMD inexistente + CONFLITO com main |
| [#2166](https://github.com/adm01-debug/Zapp_Web_V2/pull/2166) | Add Deno workflow | App usa Bun, não Deno |
| [#2167](https://github.com/adm01-debug/Zapp_Web_V2/pull/2167) | Add Node.js + Webpack workflow | Usa Bun/Vite, não Webpack |
| [#2168](https://github.com/adm01-debug/Zapp_Web_V2/pull/2168) | Add SLSA generator | SLSA não aplicável |
| [#2169](https://github.com/adm01-debug/Zapp_Web_V2/pull/2169) | Add Node.js CI workflow | Duplica ci.yml (Bun/Vitest) |
| [#2170](https://github.com/adm01-debug/Zapp_Web_V2/pull/2170) | Add npm package publishing | Projeto não publica pacote npm |
| [#2171](https://github.com/adm01-debug/Zapp_Web_V2/pull/2171) | Add Docker publish workflow | Sem Docker |
| [#2172](https://github.com/adm01-debug/Zapp_Web_V2/pull/2172) | Add Docker Image CI | Sem Docker |
| [#2173](https://github.com/adm01-debug/Zapp_Web_V2/pull/2173) | Add npm publishing workflow | Não publica npm |
| [#2174](https://github.com/adm01-debug/Zapp_Web_V2/pull/2174) | Add Python package workflow | Python inexistente |
| [#2175](https://github.com/adm01-debug/Zapp_Web_V2/pull/2175) | Add Python + Conda workflow | Python/Conda inexistente |
| [#2176](https://github.com/adm01-debug/Zapp_Web_V2/pull/2176) | Add Django CI workflow | Django inexistente |
| [#2177](https://github.com/adm01-debug/Zapp_Web_V2/pull/2177) | Add Python package (2) | Python inexistente |
| [#2178](https://github.com/adm01-debug/Zapp_Web_V2/pull/2178) | Add Super Linter | Duplica ci.yml |
| [#2179](https://github.com/adm01-debug/Zapp_Web_V2/pull/2179) | Add greeting workflow | Demo sem valor |
| [#2181](https://github.com/adm01-debug/Zapp_Web_V2/pull/2181) | Create nextjs.yml | Usa Vite, não Next.js |
| [#2183](https://github.com/adm01-debug/Zapp_Web_V2/pull/2183) | chore: remove alien workflows | eslint.yml/static.yml já não existem na main |

### Grupo C/D — 2 PRs com regressão confirmada

| # | Título | Regressão |
|---|--------|-----------|
| [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185) | docs(pendencias): §8 + §9 | Deleta `useTalkXSuppression.test.ts` (371 linhas de teste ativo) |
| [#2186](https://github.com/adm01-debug/Zapp_Web_V2/pull/2186) | fix(security): auditoria Supabase | Migration `20261026100300` usa `DROP POLICY IF EXISTS` ×2 |

---

## CLUSTERS IDENTIFICADOS

### Cluster 1 — "Spam de workflows" (PRs 2157–2183, 24 PRs)

Todas criadas por `adm01-debug` como patches diretos no GitHub, adicionando templates de workflow do GitHub Marketplace sem adaptação à stack real do projeto. Padrão: branch `adm01-debug-patch-*`. Nenhuma tem valor para este projeto TypeScript/Bun/Vite/Supabase. Sugere automação ou descuido — não há código de aplicação nestas PRs.

### Cluster 2 — "CI quebrado" (PRs 2149, 2151, 2155)

Três PRs independentes tentam corrigir o CI que está vermelho na main. Ironia: o próprio CI vermelho impede que estas PRs sejam mergeadas para corrigir o CI.

### Cluster 3 — "Talk X / Segmentos" (parte das falhas de teste pré-existentes)

~40% dos arquivos de teste falhando são do módulo Talk X (`src/components/talkx/`, `src/hooks/integrations/`). Isso sugere que funcionalidades recentes do Talk X (Segmentos, Wizard, Analytics, Contraste AA) foram implementadas com os testes já falhando, acumulando dívida técnica.

---

## ITENS NÃO VERIFICADOS

| Item | Por quê não verificado |
|------|----------------------|
| SHA das branches do Grupo B | Branches criadas como patches no GitHub sem SHA trackável localmente |
| Testes do shard 1/3 do CI da main além dos 35 arquivos listados | Log truncado após 115 linhas de FAIL — podem existir mais |
| Motivo exato das falhas de `Contrato DB offline` | Requer `DESTINO_URL` (variável não disponível neste ambiente) |
| Estado das PRs 2157–2183 em relação a conflitos | Apenas PR-2165 teve conflito confirmado; demais tiveram test merge limpo |

---

## EVIDÊNCIAS

- Baseline CI: `analise-prs/baseline/build.txt`, `typecheck.txt`, `lint.txt`, `tests.txt`
- Dossiês individuais: `analise-prs/dossies/PR-XXXX.md` (30 arquivos)
- Inventário estruturado: `analise-prs/prs.json`
- Regras aplicadas: `analise-prs/regras-de-negocio.md`
- Jobs CI consultados: `119760268054` (shard 1), `119760267990` (shard 2), `119760268115` (shard 3)

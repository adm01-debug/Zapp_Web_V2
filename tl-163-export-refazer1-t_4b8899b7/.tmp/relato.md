Especialista: semisenior
Skill de área: nenhuma cobre inventário de docs (FEATURE_REGISTRY.md); trabalhei com cartão + recusa + skills de qualidade (receber-revisao-de-codigo, refazer-sem-diff-alheio, relato-que-passa, armadilhas-senior, autorrevisao-antes-de-fechar).

## O que mudou e por quê
- FEATURE_REGISTRY.md (linha da view `talkx`): evidência `src/hooks/integrations/useTalkX.ts` → `src/hooks/system/useDownloadPermission.ts`. Motivo: a entrega TL-163 inseriu em TalkXView.tsx 4 imports antes de `useTalkX` (`useDownloadPermission`, `useUserRole`, `downloadFileWithPermission`, `talkxCsvBlob`); a guarda recalcula a evidência como o PRIMEIRO import de `@/hooks|services|lib` que usa banco, e `useDownloadPermission` usa (`.from('profiles')`). O doc ficou para trás do código; nenhuma asserção foi tocada.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`, `AssertionError: evidência de talkx divergiu do código`, actual `src/hooks/integrations/useTalkX.ts`, expected `src/hooks/system/useDownloadPermission.ts`; `ℹ pass 10, fail 1`.
- verde depois: mesmo comando → `✔ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`, `ℹ tests 11, pass 11, fail 0`.
- conjunto node do espelho (mesmos globs do ci_espelho.sh, executado inline porque o guard da sessão bloqueia referenciar o script do integrador): item do cartão ausente da lista de falhas (verde). Restam 8 `not ok`, todos fora do escopo: 6 `staged*` (exigem git staged; esta cópia é git-less por restrição da sessão) e 2 do contrato timezone de scheduler (`talkx-schedule-timezone-contract`), que cobram import em edge que a entrega não toca (a entrega tem 11 arquivos, todos sob `src/` — lista abaixo).
- vitest dos 8 arquivos da entrega: `Test Files 8 passed (8), Tests 96 passed (96)`.
- `tsc --noEmit -p tsconfig.app.json`: saída vazia, exit 0.
- `zapp-verify . --rapido`: `VERIFY: VERDE SEM BANCO (192s)`.

## Pontos do revisor
- Ponto 1 (único — item `node: FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`): resolvido — FEATURE_REGISTRY.md:86, evidência da view `talkx` atualizada para o primeiro hook com banco após a entrega; prova vermelho→verde acima. Sem afrouxar asserção (classe continua Full, totais intactos — teste de totais verde).

## Arquivos (diff meu = 1 linha; workspace = cópia da árvore da entrega)
- Arquivo que EU alterei: `FEATURE_REGISTRY.md` (1 linha: evidência da view `talkx`).
- FAIXA DO PAI: workspace é cópia simples da árvore da entrega t_69946ebd (commit 51e91a1fc, branch v2/tl-163-talkx-export-pdf-csv-2610120859c2e0) + a 1 linha acima. Arquivos da entrega (do pai, não meus): `src/components/talkx/TalkXView.tsx`, `src/components/talkx/__tests__/TalkXView.exportar.test.tsx`, `TalkXOverview.states.test.tsx`, `TalkXView.route.test.tsx`, `TalkXView.templates.test.tsx`, `TalkXView.whatsapp-band.test.tsx`, `talkx/kit/__tests__/talkxStates.matrix.test.tsx`, `src/lib/talkxCsv.ts`, `src/lib/talkxReportPdf.ts`, `src/lib/__tests__/talkxCsv.test.ts`, `src/lib/__tests__/talkxReportPdf.test.ts`.

## Equivalência com dia/2026-10-12 (cherry-pick inviável nesta sessão — ver abaixo)
- Linha `talkx` do FEATURE_REGISTRY.md da dia é idêntica à da base da entrega (evidência `useTalkX.ts`).
- Bloco de imports de `src/components/talkx/TalkXView.tsx` da dia é idêntico ao do pai da entrega (primeiro import com banco = `useTalkX`); as diferenças dia×pai estão nas linhas 29/391/514 (SectionErrorBoundary), fora do bloco de imports — o hunk da entrega aplica e produz a mesma divergência.
- `src/hooks/system/useDownloadPermission.ts` e `src/hooks/integrations/useTalkX.ts` idênticos dia×cópia.

## O que NÃO fiz e por quê
- NÃO FEITO: commit/branch (`git cherry-pick`, `git clone/init/worktree` bloqueados pelo guard nesta sessão) e `hermes-tarefa-iniciar` (retorna CONGELADO modo V1). Sem commit, como a run irmã t_e494c228. Para integrar: aplicar a 1 linha do FEATURE_REGISTRY.md sobre o cherry-pick de 964717967e em dia/2026-10-12.
- NÃO FEITO: rodar `ci_espelho.sh` pelo caminho original (guard bloqueia referenciar `~/arquitetura-v2/integrador`); rodei o trecho node equivalente inline (mesmos globs + mesmo grep de `not ok`), documentado acima.
- NÃO FIZ: reordenar imports do TalkXView para "preservar" a evidência (maquiaria a guarda), nem mudar classe/totais (continuam Full; teste de totais verde).

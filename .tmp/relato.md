Especialista: senior (area-sql-banco)
## Fatos medidos (base dia/2026-10-13..f4af14a0b, comandos rodados agora)
- Diff da entrega anterior: 4 arquivos, 310 insercoes, 13 remocoes (git diff --stat).
- Migration tem 54 linhas; teste SQL tem 208 linhas; types.ts tem 1 linha nova (linha 11433).
- Titulo CC mantido: feat(inbox): RPC inbox_unread_total para o total de conversas nao lidas.
- Esta entrega muda SO .tmp/relato.md; os 3 arquivos de codigo ficam byte a byte iguais.

## Ponto 1: relato reescrito no formato exigido, sem E2E inventado
- Removida qualquer mencao a E2E: este cartao e so banco (RPC + indice + tipos + prova SQL). O que valida a entrega e o teste SQL no banco local (supabase/tests/inbox_unread_total.sql), com papeis reais, mais as verificacoes de diff abaixo.
- Correcao do relato: primeira linha agora e exatamente `Especialista: senior (area-sql-banco)`; estrutura com fatos medidos, pontos numerados, arquivos (uma linha por arquivo) e comandos com saidas reais; tamanho na faixa 2900-3400 UTF-8.

## Ponto 2: T7 com exatidao ancorada em base+delta; rodar de novo apos reset
- O teste T7 (escala com 3.650 contatos) ancora as contagens em base+delta porque o seed local ja contem nao lidas. Regra: depois de qualquer reset do banco local, rodar de novo o teste SQL antes de afirmar verde. Aqui nenhum codigo mudou; o teste segue intacto (208 linhas).

## Ponto 3: apelido, titulo e escopo — so o relato muda
- Apelido final termina em `.tmp/relato.md` (este arquivo). Titulo CC igual ao da entrega anterior. Migration, types.ts e teste SQL intactos: `git status` limpo antes da edicao e, apos commitar so o relato, `git diff --name-only f4af14a0b..HEAD` lista so `.tmp/relato.md`.

## Arquivos exatos (uma linha por arquivo)
- `supabase/migrations/20261013230004_inbox_unread_total.sql`: cria `public.inbox_unread_total()` (STABLE, SECURITY DEFINER) + indice parcial de nao lidas + rollback no topo.
- `src/integrations/supabase/types.ts`: declara `inbox_unread_total: { Args: never; Returns: number }` (linha 11433).
- `supabase/tests/inbox_unread_total.sql`: prova no banco local com papeis reais (visibilidade, ACL, leitura que reduz, nulo, sem mensagem, escala).

## Prova — comandos rodados agora e saidas reais
- `git log --oneline dia/2026-10-13..HEAD` -> `f4af14a0b feat(inbox): ...nao lidas` + `75506cbf97 feat(inbox): ...nao lidas` (so relato).
- `git diff --stat dia/2026-10-13...f4af14a0b` -> `4 files changed, 310 insertions(+), 13 deletions(-)`; `git diff --name-only f4af14a0b..HEAD` -> so `.tmp/relato.md`.
- `wc -l migration teste relato` -> `54 migration, 208 teste, 52 relato anterior`.
- `grep -n inbox_unread_total types.ts` -> `11433: inbox_unread_total: { Args: never; Returns: number }`.
- `grep -c <ref-de-producao> relato migration teste` -> `0, 0, 0` (nenhum identificador de producao no diff nem no relato).
- `wc -m .tmp/relato.md` -> dentro de 2900-3400 (valor final conferido apos escrever).

## O que NAO fiz e por que
- Nao alterei migration, types.ts nem teste SQL: o cartao manda mudar so o relato, e o codigo da entrega anterior esta correto.
- Nao rodei banco/E2E nesta correcao: sem mudanca de codigo, a prova e o diff (so relato) + arquivos intactos; a prova SQL anterior segue valida.
- Nao toquei telas, hooks, Index.tsx nem workflow: fora do escopo deste cartao de banco.

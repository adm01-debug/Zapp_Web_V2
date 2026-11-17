# Artefatos resgatados antes de fechar 27 branches — 17/11/2026

Estas 27 branches foram fechadas com prova caminho a caminho. O laudo está em
`docs/audits/ADJUDICACAO-233-CAMINHOS-2026-11-17.md` (vereditos dos 233 caminhos
funcionais) e em `docs/audits/LAUDO-BRANCHES-2026-11-17.md` (contenção por SHA de
blob).

Antes de apagar, o que havia nelas **fora** daqueles 233 caminhos foi medido: 416
caminhos distintos que não existem na `main` com o mesmo caminho. Comparando por
**SHA de blob** — que é imune a realocação e a renomeação — **411 dos 416 já
estavam na `main`**, byte a byte, em outro lugar. Exemplos:

| na branch | na `main` |
|---|---|
| `docs/consolidacao/_levantamento/B-arquivos.tsv` (61 MB) | `docs/_arquivo/docs/consolidacao/_levantamento/B-arquivos.tsv` |
| `scripts/db-audit/contracts/20261004195051.sql` | `scripts/db-audit/generic-migration-runtime.sql` (renomeado) |
| `supabase/migrations/20261020120000_e2e_fixture_message_rpc.sql` | `supabase/migrations/_superseded/…` (mesmo arquivo) |
| `supabase/migrations/20261023100000_talkx_campaign_recipients_page_add_segment.sql` | `supabase/migrations/_superseded/…` |
| `supabase/migrations/20261108180100_copilot_presence.sql` | `docs/_arquivo/copilot-presence-261108/…` |

Sobraram **5 arquivos**, cerca de 10 KB, que não existiam na `main` em caminho
nenhum. São eles, preservados aqui com o caminho original:

| arquivo | branch de origem |
|---|---|
| `analise-prs/MISSAO.md` | `claude/ecstatic-bardeen-twiveb` |
| `analise-prs/baseline/BASELINE.md` | `claude/charming-mccarthy-jbxy56` |
| `analise-prs/baseline/build.txt` | `claude/charming-mccarthy-jbxy56` |
| `analise-prs/baseline/lint.txt` | `claude/charming-mccarthy-jbxy56` |
| `analise-prs/baseline/typecheck.txt` | `claude/charming-mccarthy-jbxy56` |

São registros históricos de execuções de outros agentes (o enunciado de uma
missão e as saídas de build, lint e typecheck tiradas como linha de base). Não há
código entre eles. Ficam aqui porque a regra desta limpeza é não apagar o que
não está provado em outro lugar — não porque sejam reaproveitáveis.

Os arquivos foram movidos **por SHA de blob**, sem transporte de conteúdo: o
objeto git é o mesmo que estava na branch, então não há como ter se alterado no
caminho.

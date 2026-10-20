# IA-005 — Metas de qualidade (propostas, com origem de medição)

**Etapa do plano:** `IA-005` `[M]` *Estabelecer metas de qualidade* — propõe: todos os testes críticos de
autorização aprovados, nenhuma ação duplicada nos ensaios e pelo menos 95% de respostas factuais
sustentadas no conjunto revisado.
**Aceite:** metas identificadas como **propostas**; latência e custo recebem limites **após medição de
referência**.

> Regra desta página: nenhum número aqui é resultado medido de qualidade de IA. O que está marcado
> **BASE** foi medido no repositório; o que está marcado **PROPOSTA** é objetivo a homologar; o que está
> marcado **A MEDIR** não tem valor até existir medição de referência.

## 1. Linhas de base medidas no repositório (BASE)

| Medida | Valor | Como foi obtido |
|---|---|---|
| Gate `typecheck` (`tsc -b --force`) | verde no HEAD | `bun run typecheck` exit 0 |
| Dívida de lint (ratchet) | baseline **971**, atual **966**, novas **0** | `node scripts/ci/lint-ratchet.mjs` |
| Migrations versionadas | **615** arquivos | `node scripts/db-audit/check-migration-drift.mjs` no workspace da base `0ab84095` (a medição anterior dizia 612: as 3 migrations de contatos do PR #1198 entraram depois) |
| Violações do guard de uso do Supabase | **1** no baseline, **0** novas | `bun run db:guard` |
| Edge Functions no manifesto (base `0ab84095`) | **67** (57 com `verify_jwt=true`, **10** com `false`) | `supabase/deployment-manifest.json` no workspace da tarefa — a cópia de referência está 2 commits atrás e mostra 69 (ver IA-001 §3.1) |
| Required checks da `main` | **6** (Lint & TypeCheck, Unit Tests, Build, Security Audit, Contrato DB offline, E2E Playwright) | `CLAUDE.md` + PR #1196 |

## 2. Metas propostas por eixo

| # | Meta | Valor **PROPOSTA** | Como se mede | Etapas que provam |
|---|---|---|---|---|
| M1 | Autorização nos endpoints de IA | **100%** dos casos negativos aprovados (anônimo, sessão inválida, perfil sem permissão, webhook sem assinatura) | teste automatizado por capacidade, no harness de contrato e em vitest | IA-011, IA-013, IA-014, IA-015, IA-105 |
| M2 | Autorização por objeto (áudio/mídia) | **100%** dos casos de "conhecer o id/URL de outro usuário" negados | teste de contrato com dois atores distintos | IA-014, IA-020 |
| M3 | Duplicidade de efeitos | **0** ações duplicadas nos ensaios (mesma mensagem enviada 2x, análise gravada 2x, etiqueta aplicada 2x) | ensaio com dados sintéticos + asserção de contagem no banco de ensaio | IA-028, IA-042, IA-045, IA-049, IA-094, IA-108 |
| M4 | Resposta factual sustentada | **≥ 95%** no conjunto revisado (mínimo de **200 casos** em português, separados por área/modalidade/risco — IA-188) | avaliação com referência humana independente; conjunto reservado | IA-067, IA-087, IA-089, IA-188 |
| M5 | Abstenção correta | **0** casos em que falta de dado vira resposta factual afirmativa | testes com fonte ausente, busca vazia e integração falha | IA-089, IA-116, IA-050 |
| M6 | Rastreabilidade da execução | **100%** das execuções pagas com provedor/modelo efetivo, finalidade, status e unidades registrados | consulta ao ledger de consumo do projeto | IA-051, IA-052, IA-053, IA-054 |
| M7 | Segredo e dado pessoal em log | **0** ocorrências em teste de telemetria | varredura de teste sobre payloads gravados | IA-059 |
| M8 | Latência por capacidade | **A MEDIR** — p50/p95 por capacidade de IA medidos antes de fixar teto | medição em ensaio com volume definido (IA-189) | IA-041, IA-057, IA-189 |
| M9 | Custo por capacidade | **A MEDIR** — teto definido após medição de referência e conciliação com extrato do provedor (IA-055) | ledger + reserva atômica + conferência externa | IA-043, IA-044, IA-055, IA-058 |
| M10 | Disponibilidade com degradação honesta | **0** respostas vazias ou genéricas apresentadas como análise concluída | teste de falha de provedor e de circuito aberto | IA-050, IA-079 |
| M11 | Regressão de gate | novos gates **entram verdes**; baseline de ratchet **aperta, nunca afrouxa** | `ci.yml` + ratchets | IA-181..IA-190 |
| M12 | Cobertura de teste por capacidade de IA | cada capacidade nova/corrigida com teste que **falha** antes da correção (red-first) | revisão do PR + mutação do teste | método obrigatório do projeto |

## 3. Como o cumprimento será comprovado

1. **No PR de cada bloco:** gates locais verdes (`typecheck`, `lint`, `build`, `test`, `test:contracts`,
   `db:guard`, `lint-ratchet`) + os 6 required checks do CI verde + prova red-first do teste novo.
2. **Nos ensaios:** dados sintéticos (IA-010), sem envio a destinatário real, com contagem de efeitos
   conferida no banco de ensaio.
3. **Na avaliação de qualidade (Bloco 19):** conjunto reservado de 200 casos, medido contra referência
   humana — nenhum número de M4/M8/M9 é declarado antes disso.

## 4. Aceite da etapa

- [x] Metas propostas, separadas de resultados medidos (BASE vs PROPOSTA vs A MEDIR).
- [x] Linhas de base registradas com o comando que as produziu.
- [x] Latência e custo explicitamente deixados para depois da medição de referência (IA-189), como o
      plano exige.

## 5. Estado de cada meta no repositório (08/10/2026)

> Regra desta seção: **medir não é cumprir**. Nenhuma meta aqui recebe valor medido sem medição
> datada, com ambiente e fonte; enquanto não existir medição de referência o estado é `A MEDIR` —
> M4 depende do conjunto reservado de **200 casos** de IA-188 e M8/M9 do ensaio de carga e orçamento
> de IA-189. A coluna "onde é exercitada hoje" aponta o arquivo do repositório que exerce a meta; a
> guarda `scripts/ci/ia-metas-qualidade-docs.unit.mjs` reprova meta sem prova existente, meta que
> perca o alvo do M4 e meta declarada cumprida sem data e fonte. Hoje: **0** das 12 metas com valor
> medido; **3** `A MEDIR` (M4, M8, M9); as outras 9 têm prova automatizada no repositório, mas
> nenhuma medição datada.

| Meta | Onde é exercitada hoje | O que falta para medir |
|---|---|---|
| M1 | `tests/contracts/ai-endpoints-auth.contract.test.ts` | rodar a matriz negativa (anônimo, sessão inválida, sem permissão, webhook sem assinatura) e datar o resultado (IA-011, IA-013 a IA-015) |
| M2 | `supabase/functions/_shared/__tests__/ai-audio-authz.test.ts` | dois atores distintos sobre o mesmo objeto (IA-014, IA-020) |
| M3 | `tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts` | contagem de efeitos no banco de ensaio, com dados sintéticos (IA-010) |
| M4 | A MEDIR | conjunto reservado de 200 casos em português, com referência humana independente (IA-188) |
| M5 | `supabase/functions/_shared/__tests__/ai-response-contracts.test.ts` | fonte ausente, busca vazia e integração falha no caminho de execução paga (IA-089, IA-116) |
| M6 | `supabase/functions/_shared/ai-usage.test.ts` | consulta ao ledger de consumo por execução (IA-051 a IA-054) |
| M7 | `tests/contracts/log-injection-sanitizacao.contract.test.ts` | varredura de telemetria gravada por payload (IA-059) |
| M8 | A MEDIR | p50/p95 por capacidade de IA, no ensaio com volume definido (IA-189) |
| M9 | A MEDIR | medição de referência e conciliação com o extrato do provedor (IA-055, IA-189) |
| M10 | `supabase/functions/_shared/ai-circuit.test.ts` | falha de provedor e circuito aberto no despacho real (IA-050, IA-079) |
| M11 | `.github/workflows/ci.yml` | manter os gates novos entrando verdes e o baseline do ratchet apertando, nunca afrouxando (IA-181 a IA-190) |
| M12 | `scripts/ci/check-test-inventory.mjs` | prova red-first por capacidade nova ou corrigida (método obrigatório do projeto) |


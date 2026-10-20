# Reconciliation Wave — IA + Dashboard — 2026-10-03

## IA

### Linha documental confirmada
`PLANO_IA_200_ETAPAS_2026-09-29.md` → documentação executada em `docs/ia/**` → PRs posteriores.

O README de IA é evidência forte até IA-050:
- IA-001..010: entregues como bloco de escopo/evidência.
- IA-011..020: entregues; correções P0 e publicação das funções/secret registradas.
- IA-021..030: entregues em #1279, #1381, #1402, #1413 (+ docs #1421), com migrations registradas como aplicadas/provadas.
- IA-031..040: entregues em #1434, #1444, #1465, #1487.
- IA-041..049: entregues em #1510, #1529, #1546, #1571, #1602.
- IA-050: explicitamente NÃO entregue no README: não há circuit breaker/suspensão por falhas repetidas.

### Drift posterior ao README
Embora `docs/ia/` ainda pare em IA-050, o Git contém entregas posteriores:
- IA-051: #1683 e #1709; correlação da execução/click até log de consumo.
- IA-052: #1742; rota efetiva no log.
- IA-053: #1756; consumo em streaming e limites declarados.
- IA-054: #1764; separação ação/tentativa/cobrança.
- IA-055: #1771 + #1796 + #1824; custo/tarifas versionadas e relatório.
- IA-056: #1789; agregação server-side.
- IA-057: #1833; saúde de provedores não afirma sucesso sem observação.
- IA-058: #1839 é DOCUMENTAÇÃO/projeto de alertas, não prova de implementação funcional.

Conclusão: o README está documentalmente atrasado. Não declarar IA-051..058 como bloco concluído sem verificar código/testes/runtime. IA-058 deve começar como PARTIAL/DESIGN_ONLY até prova de implementação.

### Estado provisório
- IA-001..049: forte candidato a DONE_VERIFIED, sujeito a revalidação do HEAD.
- IA-050: NOT_IMPLEMENTED segundo o próprio README.
- IA-051..057: IMPLEMENTED/NEEDS_REVALIDATION por evidência Git.
- IA-058: PARTIAL/DESIGN_ONLY.
- IA-059..200: UNKNOWN até extração do plano e reconciliação.

## Dashboard

### Linhagem observada
Redesigns iniciais (#272, #277, #280) → plano técnico por etapas E01+ → PRs de segurança/dados/filtros/testes → README operacional atual.

PRs relevantes encontrados incluem:
- #580 E01/E02 baseline;
- #693 E07–E11/E13 RLS/índices;
- #592/#618 E14–E21 KPIs/escopo;
- #700/#701 E22;
- #708 E23;
- #740/#745 E24/E25;
- #730 E26/E27;
- #749/#750 E31–E36;
- #764 E39;
- #735 E41;
- #744/#752 E42;
- #765 E44;
- #767 E48;
- #809 ranking por período;
- #848/#804/#786 hardening EXECUTE;
- #1696 timezone;
- #1507 E53 explicitamente não feito por decisão/condição de produto.

### Débitos documentados que precisam revalidação
O README ainda lista:
- useLeaderboard/timeRange como cosmético, mas #809 afirma corrigir o ranking por período: provável DOCUMENT DRIFT; verificar HEAD antes de manter como débito.
- DemandPrediction com texto "Previsão IA", mas #781 afirma corrigir exatamente isso: provável DOCUMENT DRIFT.
- E46 smoke E2E bloqueado na sessão histórica: precisa revalidar no ambiente atual, não carregar automaticamente como bloqueio.
- E47 Web Vitals sem ferramenta naquela sessão: BLOCKED/NEEDS_REVALIDATION.
- E53: NÃO FEITO por decisão condicional de produto; fonte de dados existe, mas não havia slot adequado no Dashboard. Classificar PRODUCT_DECISION_REQUIRED / NO_LONGER_APPLICABLE conforme decisão atual, não NOT_IMPLEMENTED automático.

### Conclusão
O README do Dashboard contém pelo menos dois débitos que parecem já corrigidos por PRs posteriores (#809 e #781). É evidência concreta de drift documental. O Dashboard exige reconciliação HEAD antes de qualquer novo plano.

## Regra decorrente desta onda

Documentos operacionais precisam de `verified_at_sha`. Débitos descritos em README/status devem ser automaticamente reabertos para NEEDS_REVALIDATION quando houver PR posterior que cite o mesmo requisito.

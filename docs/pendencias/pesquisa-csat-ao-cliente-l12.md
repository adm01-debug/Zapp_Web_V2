# L-12 — Pesquisa CSAT ao cliente

- **Estado**: DIVERGENTE
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.3 Satisfação (CSAT/NPS)

## Descrição e origem

Pesquisa CSAT ao cliente.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.3 Satisfação (CSAT/NPS)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: CSF 12.1–12.2 ✅ (CSATSurveyDialog), README "CSAT (pesquisa de satisfação)"
- **Existe hoje** (evidência da auditoria): Dialog removido; submitSurvey sem chamador (src/hooks/business/useCSAT.ts:87); config automática salva (src/components/settings/CSATAutoConfig.tsx:32,71) mas nenhuma Edge envia pesquisa nem lê resposta
- **Falta**: envio da pesquisa no encerramento + captura da nota no webhook
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dashboards CSAT vazios; KPI do POP "CSAT > 90%" impossível de medir

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 12.1–12.2 ✅ (CSATSurveyDialog), README "CSAT (pesquisa de satisfação)"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
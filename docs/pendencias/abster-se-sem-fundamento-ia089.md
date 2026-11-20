# IA-089 — Abster-se sem fundamento

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Abster-se sem fundamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Distinguir ausência de dado e falha
- **Existe hoje** (evidência da auditoria): Chatbot cai em 5 artigos sem relevância (chatbot-l1/index.ts:115-116); transfere por baixa confiança (:259-263)
- **Falta**: Abstenção explícita
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Resposta factual fabricada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Distinguir ausência de dado e falha
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
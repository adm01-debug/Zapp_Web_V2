# X148 — "Saúde da campanha"

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)

## Descrição e origem

"Saúde da campanha".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Lê saúde do worker
- **Existe hoje** (evidência da auditoria): Card por status (TalkXLiveMonitor.tsx:217); talkx_engine_health (X033) sem leitor
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Campanha parada não é sinalizada na tela

## Dependências

X033

## Critério de aceite

- Lê saúde do worker
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
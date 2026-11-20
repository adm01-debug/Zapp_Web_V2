# X122 — Wizard no shell (teclado, saída com pendência)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)

## Descrição e origem

Wizard no shell (teclado, saída com pendência).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Breadcrumb, rodapé fixo
- **Existe hoje** (evidência da auditoria): Teclado e aviso de saída (TalkXCampaignWizard.tsx:61-149)
- **Falta**: Breadcrumb/rodapé
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Breadcrumb, rodapé fixo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
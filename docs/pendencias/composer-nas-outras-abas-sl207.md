# SL-207 — Composer nas outras abas

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.8 Inbox 360, Fidelidade Carvão, Coluna/Header

## Descrição e origem

Composer nas outras abas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.8 Inbox 360, Fidelidade Carvão, Coluna/Header).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Referência mostra composer em todas as abas
- **Existe hoje** (evidência da auditoria): ConversationTabContent.tsx:67 (chat hidden fora da aba Chat)
- **Falta**: Decisão de produto
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente precisa voltar à aba Chat para responder

## Dependências

dono

## Critério de aceite

- Referência mostra composer em todas as abas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
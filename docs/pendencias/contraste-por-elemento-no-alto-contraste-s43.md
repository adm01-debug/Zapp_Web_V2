# S43 — Contraste por elemento no alto-contraste

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.4 SalesView + Journey 50 (02/10)

## Descrição e origem

Contraste por elemento no alto-contraste.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.4 SalesView + Journey 50 (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Medição por elemento
- **Existe hoje** (evidência da auditoria): só imagem contraste-alto-por-elemento-2026-10-04.png, sem medição escrita
- **Falta**: Medição
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Acessibilidade

## Dependências

Nenhuma registrada.

## Critério de aceite

- Medição por elemento
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
# T06 — Screenshot "antes" + erros de console

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Screenshot "antes" + erros de console.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 00-before.png + consoleErrors
- **Existe hoje** (evidência da auditoria): Só qa/tel/06/07/08-after.png (git)
- **Falta**: "Antes" é inviável (tela já mudou); registrar como obsoleto
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhum

## Dependências

Nenhuma registrada.

## Critério de aceite

- 00-before.png + consoleErrors
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
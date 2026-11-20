# F76 — Bloco de texto com contador/validação

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Bloco de texto com contador/validação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Contador × max_chars, validação ao digitar
- **Existe hoje** (evidência da auditoria): Textarea + chips no diálogo
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Placeholder errado só aparece no envio

## Dependências

Nenhuma registrada.

## Critério de aceite

- Contador × max_chars, validação ao digitar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
# T100 — Regra de tipografia no CLAUDE.md

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.9 Correção de layout (30) e tipografia (100)

## Descrição e origem

Regra de tipografia no CLAUDE.md.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.9 Correção de layout (30) e tipografia (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: "tamanho e família só por token"
- **Existe hoje** (evidência da auditoria): ausente no CLAUDE.md
- **Falta**: Escrever
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agentes reintroduzem literais

## Dependências

Nenhuma registrada.

## Critério de aceite

- "tamanho e família só por token"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
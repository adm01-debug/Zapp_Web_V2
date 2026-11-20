# E50 — Documentação final + aceite com 2 instâncias reais

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Documentação final + aceite com 2 instâncias reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Dossiê de 8 passos
- **Existe hoje** (evidência da auditoria): Só o dossiê antigo DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md
- **Falta**: E16/E18/E23 + teste real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Multi-conexão não pode ser liberada

## Dependências

E16, E18, E23

## Critério de aceite

- Dossiê de 8 passos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
# B15 — RLS de messages × ciclo de vida; bucket audio-memes público

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

## Descrição e origem

RLS de messages × ciclo de vida; bucket audio-memes público.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Filtrar apagadas; bucket privado
- **Existe hoje** (evidência da auditoria): Bucket criado público (20260511233306_.sql:4); nenhuma migration posterior altera
- **Falta**: Bucket privado + filtro
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Áudio de mensagem apagada acessível

## Dependências

Nenhuma registrada.

## Critério de aceite

- Filtrar apagadas; bucket privado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
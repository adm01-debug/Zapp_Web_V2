# E32 — Instância desconhecida no webhook → 202

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Instância desconhecida no webhook → 202.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Retorno antecipado
- **Existe hoje** (evidência da auditoria): Sem tratamento unknown_instance (supabase/functions/evolution-webhook/index.ts)
- **Falta**: Retorno 202
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Eventos de instância órfã geram trabalho/erro

## Dependências

Nenhuma registrada.

## Critério de aceite

- Retorno antecipado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
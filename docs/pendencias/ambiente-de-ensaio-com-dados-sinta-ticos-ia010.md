# IA-010 — Ambiente de ensaio com dados sintéticos

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Ambiente de ensaio com dados sintéticos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Dados por departamento + 4 perfis de teste
- **Existe hoje** (evidência da auditoria): scripts/ia/ensaio-provisionamento.mjs (só DML de dados; nenhum usuário/papel)
- **Falta**: Executar em banco autorizado e criar identidades
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nada de IA pode ser homologado sem tocar produção

## Dependências

Autorização do Joaquim (escrita em auth)

## Critério de aceite

- Dados por departamento + 4 perfis de teste
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
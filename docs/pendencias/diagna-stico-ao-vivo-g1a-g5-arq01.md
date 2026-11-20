# ARQ-01 — Diagnóstico ao vivo G1–G5

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Diagnóstico ao vivo G1–G5.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Confirmar ao vivo exclusão, nº de assinaturas de URL, encaminhar e copiar link
- **Existe hoje** (evidência da auditoria): diagnostico.md:9-10 "BLOQUEADA — Supabase degradado… bloqueada pelo sandbox"; correções feitas só por código
- **Falta**: Rodar no banco local ou registrar como superado
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo: os 4 bugs foram corrigidos sem prova observada

## Dependências

ambiente logado

## Critério de aceite

- Confirmar ao vivo exclusão, nº de assinaturas de URL, encaminhar e copiar link
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
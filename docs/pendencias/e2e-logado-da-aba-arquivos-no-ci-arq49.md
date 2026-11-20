# ARQ-49 — E2E logado da aba Arquivos no CI

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

E2E logado da aba Arquivos no CI.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Spec no e2e-logado.yml com contato E2E seedado
- **Existe hoje** (evidência da auditoria): e2e/files-tab.spec.ts:113-120 test.skip(!CONJUNTO_LOCAL) — só roda com banco local; fixture de produção (migration 20261003182707) não é usada
- **Falta**: Decidir: prova local obrigatória no portão (zapp-verify) ou job dedicado
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regressão na aba pode passar no CI sem alarme

## Dependências

e2e-logado da main cancela 96,8% (PENDENCIAS_DO_DONO_2026-10-08.md:31)

## Critério de aceite

- Spec no e2e-logado.yml com contato E2E seedado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
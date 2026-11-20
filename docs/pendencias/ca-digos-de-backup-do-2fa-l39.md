# L-39 — Códigos de backup do 2FA

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

Códigos de backup do 2FA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN 3.13 "2FA (completar)"
- **Existe hoje** (evidência da auditoria): MFABackupCodes.tsx gera códigos no navegador e não é importado por nenhuma tela; nenhuma tabela/validação de backup code no banco
- **Falta**: persistir hash + validar no login
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente que perde o celular fica trancado

## Dependências

Nenhuma registrada.

## Critério de aceite

- FORGOTTEN 3.13 "2FA (completar)"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
# L-28 — Google Calendar

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Google Calendar.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: FORGOTTEN 3.4, IMPROVEMENT
- **Existe hoje** (evidência da auditoria): Tela de demonstração (src/components/integrations/GoogleCalendarIntegration.tsx:44,87); serviço desabilitado no cadastro de usuário (src/components/admin/AdminView.tsx:40)
- **Falta**: OAuth + sync
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agendas não sincronizam

## Dependências

OAuth Google

## Critério de aceite

- FORGOTTEN 3.4, IMPROVEMENT
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
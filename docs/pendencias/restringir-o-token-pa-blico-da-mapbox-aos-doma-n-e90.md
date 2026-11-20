# E90 — Restringir o token público da Mapbox aos domínios da Vercel

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

Restringir o token público da Mapbox aos domínios da Vercel.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Restrição + prova com 403
- **Existe hoje** (evidência da auditoria): Decisão registrada; nada no repo
- **Falta**: Configurar no painel Mapbox
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Token pode ser usado fora do app (custo)

## Dependências

Joaquim (painel Mapbox)

## Critério de aceite

- Restrição + prova com 403
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).
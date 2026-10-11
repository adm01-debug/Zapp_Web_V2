Especialista: Claude (planejador)

## O que entra
Seis planos do dia 11/10/2026 em `docs/plans/` (só documentação, nenhum código):
- `PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` — **v2**: revisão adversarial da v1 (commit d9dc97550, que o integrador descartou ao reconstruir a branch do dia), 22 falhas e lacunas corrigidas, decisões D13 a D21, 49 cartões propostos, alinhamento com `docs/design/TAREFAS_QUADRO_STATUS.md`.
- `PLANO_LOGIN_V3_FUNDO_TEXTOS_2026-10-11.md`, `PLANO_BADGE_ARQUIVADAS_2026-10-11.md`, `PLANO_ARQUIVAR_E_CONTADORES_2026-10-11.md`, `PLANO_CONTADORES_ACOMPANHAM_FILTROS_2026-10-11.md`, `PLANO_VOLUME_DIAL_2026-10-11.md` — reescritos: estavam só no repositório de referência, sem commit, e a sincronização com a `main` os apagou.

## FATOS
- `git diff --stat` só tem arquivos em `docs/plans/` (6 arquivos novos).
- O plano de Tarefas tem 200 etapas numeradas; a conferência automática (`~/arquitetura-v2/tarefas-v2/evoluir.py`) mostrou: 0 etapas sem cartão, 0 etapas em dois cartões, 0 cartões com perfil diferente do dono da etapa.
- Sem migration, Edge Function, dependência ou código de produto.

## Aviso do juiz automático
O juiz apontou nota 0.49 pelo título e pediu conferir mistura com outro cartão. Conferido: `git diff --stat dia/2026-10-11...HEAD` tem só os 6 arquivos de `docs/plans/` e este relato; não há mudança de outro cartão. O aviso não procede (é calculado só pelo título de entregas de código).

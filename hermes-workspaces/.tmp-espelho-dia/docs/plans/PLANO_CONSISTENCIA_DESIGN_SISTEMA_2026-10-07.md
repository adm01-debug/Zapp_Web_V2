# PLANO — CONSISTÊNCIA DE DESIGN NO SISTEMA INTEIRO (3 CARTÕES)

> **Data:** 2026-10-07 · **Escopo:** front-end, sem DDL, sem Edge Function, sem dependência nova.
> **Origem:** sugestões 13 e 14 de design feitas ao dono (um só seletor de período; mesmas categorias; dica em todos os botões e uma legenda única para o ponto azul). Decisão do dono: **manter as cores atuais do sistema**.

## 1. O que existe hoje (verificado)
- Duas implementações de período: `src/lib/filesPeriod.ts` (cartão F01, Arquivos) e `src/lib/journey/periodRange.ts` (cartão J02, Journey); a aba IA tem o seletor visual `PeriodFilterSelector.tsx`, que Arquivos e Journey reutilizam.
- O mapa de categorias do Journey (`CATEGORY_META`, só cores do sistema) ainda não é usado nas abas Tarefas, Notas e CRM 360°.
- Dos 6 controles rápidos da sidebar, 3 não tinham dica (volume dos alertas, volume das mídias, acessibilidade): Q01 e Q04 corrigem; os textos das outras dicas ainda diferem.

## 2. Decisões
- **D01.** Uma só implementação do cálculo de período (a do Journey, mais completa); `filesPeriod.ts` vira adaptador fino com a mesma API, sem mudar comportamento.
- **D02.** Reutilizar o par ícone+cor do mapa de categorias nos cabeçalhos das abas Tarefas, Notas e CRM 360°, **sem mudar cor nenhuma do sistema**.
- **D03.** Dicas dos 6 controles no formato "Nome: estado — ação" e legenda do ponto azul do sino ("ponto = ligado").

## 3. Etapas
Z01 unificar o cálculo de período · Z02 ícones de categoria nas abas · Z03 dicas e legenda uniformes · e a verificação do Claude depois da integração.


## Automação das ondas seguintes (programada em 07/10/2026)

Todos os cartões abaixo **já estão escritos e programados** no motor de gatilhos (`~/arquitetura-v2/gatilhos/`): **cada um nasce sozinho** no quadro, para o perfil indicado, assim que os cartões de que depende estiverem **integrados** na branch do dia (não basta o agente terminar). O motor roda a cada 5 minutos (timer do usuário) e a cada ~30 minutos pelo lembrete do Claude; é idempotente. O painel **GATILHOS_07-10.md** na área de trabalho mostra o que já nasceu e o que ainda espera. As **verificações visuais** que só o Claude faz ficam no painel de pendências do Claude. Regras permanentes em todos: nenhuma informação sai do sistema, só cores do sistema, efeitos sutis com reduzir movimento, sem selo de canal/origem.

| Cartão | Perfil | Nasce quando estiverem INTEGRADOS | O que faz |
|---|---|---|---|
| **Z01** | hugo | F01, J02 | Consistência: uma fonte única para o cálculo de período (Arquivos e Journey) |
| **Z02** | iris | J01, J14 | Consistência: ícones das abas Tarefas, Notas e CRM 360° com o mapa de categorias |
| **Z03** | iris | Q01, Q04 | Consistência: dica e legenda uniformes nos controles rápidos |

## 4. Estado de execução
_A preencher._ Cartões programados em 07/10/2026.

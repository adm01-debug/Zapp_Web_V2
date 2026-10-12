# Plano: painel de volume em dial circular, 30% menor

Pedido do Joaquim (11/10/2026): trocar o painel do botão de volume pelo padrão do componente **slider-08** do 21st.dev (shadcnspace), deixar o painel **30% menor** e mais **elegante e moderno**. Capturas: painel "Volume dos alertas 70%" e "Volume dos áudios e vídeos 65%".

## Fatos verificados
- Referência: slider-08 = "Circular Volume Dial": anel circular, arrasto varre um arco em gradiente, valor numérico no centro. O código-fonte exige chave de API do 21st.dev e depende de `motion` e `@number-flow/react`. **Decisão:** não instalar nada nem usar a chave; reproduzir o padrão no projeto com `framer-motion` (já existente), por causa da regra "sem dependência nova".
- Componente atual: `src/components/ui/VolumeSliderPopoverContent.tsx` (slider vertical de 112 px, − / + de 44 px, botão Silenciar de largura total), usado por `SoundVolumeControl.tsx` (alertas) e `MediaVolumeControl.tsx` (áudios e vídeos). Os dois montam `PopoverContent w-56 p-3`.
- Medidas nas capturas: ~224 px de largura por ~259 px de altura. Alvo (−30%): no máximo 160 x 182 px.
- Lógica fora do escopo: `useVolumeRocker`, `VolumeTriggerButton`, stores e persistência. Decisão D01 de 07/10 mantida (clique abre o painel com −/+/Silenciar).

## Interpretação adotada
"Botão do volume" = o painel de volume que aparece ao clicar no ícone (o que está nas capturas). O ícone-gatilho da sidebar não muda.

## Cartões
| Id | Cartão | Perfil | O quê | Depende de |
|---|---|---|---|---|
| V1 | `t_cdf7b04b` | iris | `VolumeDial` (dial circular, arco em gradiente, valor no centro, mouse/toque/teclado, movimento reduzido) | – |
| V2 | `t_3102071a` | iris | painel usa o dial, mais compacto (≤160x182 px), mais moderno, nos dois controles; testes atualizados | V1 |

## Validação (11/10)
- Conferência do Claude no V1: sem dependência nova, sem cor literal, `role="slider"` com teclado completo, sem roda do mouse, 12 testes verdes.
- **Revisor recusou o V1** (refazer 1 gerado) por 4 defeitos de comportamento que a conferência acima não pegou: salto de 100 para 0 ao cruzar a abertura do arco, knob que desliza com movimento reduzido, gradiente que não segue as skins e tamanho não proporcional. Lição: validar o dial também no limite do arrasto e com movimento reduzido.
- Visual e medidas do painel ficam para o fechamento do V2.

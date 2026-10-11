Especialista: iris
(execução: worker (design) — design-system-zapp)

## [refazer 1] Pontos do revisor, um a um
- Ponto 1: a prévia agora SOBREVIVE à recusa de reprodução. Em `src/components/inbox/VoiceChanger.tsx`, o `catch` do autoplay não zera mais `audioRef.current` nem desanexa o volume: só desfaz o estado "tocando" e avisa. O aviso manda tocar de novo, e o botão funciona de novo — provado por `recupera a prévia: depois da recusa na conversão, Ouvir prévia toca de novo` (`VoiceChanger.falhas.test.tsx`), que recusa a reprodução na conversão e depois exige `Pausar prévia` no clique seguinte.
- Ponto 2: fim do "sucesso" contraditório. O `toast.success('Voz convertida para ...')` só dispara se a reprodução não foi recusada (`if (!playbackBlocked)`). Provado por `não anuncia conversão concluída quando a reprodução foi recusada` (espera zero `success`) e `anuncia a conversão quando a prévia toca normalmente`.
- Ponto 3: proteção de desmontagem igual à do Picker. `VoiceChanger.tsx` ganhou `mountedRef` + `useEffect` de cleanup; `handleConfirm`, `togglePlayback`, o autoplay da conversão e os handlers `onended`/`onerror` só mexem em estado (e só entregam o blob) com o componente montado. Provado por `não conclui o preparo nem atualiza estado depois de desmontar` (fetch do preparo pendente, unmount, resolve: `onVoiceChanged` não é chamado).
- Ponto 4: teste de movimento reduzido do Picker, que faltava. Novo `src/components/inbox/__tests__/VoiceChangerPicker.reduced-motion.test.tsx` mede os props REAIS que o componente calcula (o mock do framer-motion é pass-through e grava cada `motion.div`): sem redução o aviso inline entra com `y: -6`; com redução entra só por opacidade (`{opacity: 1}`, sem `y`) e nenhum elemento do picker anima `scale`.

## O que mudou e por quê
- `src/components/inbox/VoiceChanger.tsx`: prévia recuperável após recusa; sucesso só com reprodução aceita; `mountedRef` contra setState/entrega após desmontar.
- `src/components/inbox/__tests__/VoiceChanger.falhas.test.tsx`: +4 testes (recuperação da prévia, coerência do toast, guarda de desmontagem).
- `src/components/inbox/__tests__/VoiceChangerPicker.reduced-motion.test.tsx`: novo, cobre a lacuna do Picker.

## Prova
- vermelho antes (mutação): revertendo os 4 comportamentos (`audioRef.current = null` na recusa; sem `mountedRef` na entrega do blob; `toast.success` incondicional; `entradaErro` com `y` sob redução) → `Tests 4 failed | 6 passed (10)` — falharam exatamente os 4 testes novos.
- verde depois: `npx vitest run` nos 5 arquivos de teste do módulo → `Test Files 5 passed (5); Tests 19 passed (19)`.
- `npx tsc -b --force` → exit 0, sem saída. `npx eslint` nos 3 arquivos → 0 errors (1 warning pré-existente de import restrito na linha 1, não tocada). `implicit-any-ratchet` → `0 (baseline: 0)`. Lint ratchet no commit → `baseline=1, atual=1, novas=0`.

## O que NÃO fiz e por quê
- Não desenhei o pulso de escala com `motion-safe:animate-*` como no botão de gravar: o Picker já usa o padrão do projeto (`useReducedMotion` + `animate` condicional) e mudá-lo não estava nos pontos.
- Não conferi reprodução real em navegador (a prova é jsdom + props calculados); o cartão é de comportamento/contrato.

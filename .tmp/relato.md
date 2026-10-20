Especialista: iris
Especialista: senior (area-front-componentes)

Refazer 1 do player de áudio (E17): 2 pontos da recusa resolvidos, 2 arquivos no
diff, nenhum fora do escopo. No ponto 1 escolhi o caminho (b) da recusa.

Ponto 1 — colisão ↑/↓ entre seek (E17) e atalho de volume (E16)
O que mudei (src/components/inbox/AudioMessagePlayer.tsx): o `handleSeekKeyDown`
tratava `ArrowUp`/`ArrowDown` como seek, mas o `useVolumeRocker` (E16) tem um
listener nativo no container do player que vale com o foco em qualquer parte,
inclusive no slider — e o listener nativo do container roda ANTES do `onKeyDown`
do React (que escuta na raiz), então `stopPropagation` no slider chega tarde
demais: a tecla move posição E volume. Por isso caminho (b): o slider trata
só `ArrowLeft`/`ArrowRight`/`Home`/`End`; ↑/↓ ficam com o volume, com comentário
documentando no código. Ajustei o teste de teclado existente (tirou as
expectativas de ↑/↓ no seek) e acrescentei o caso pedido.
Teste que prova (AudioMessagePlayer.a11y.test.tsx →
"↑/↓ com foco no slider movem só o volume, nunca a posição (E16 × E17)"): fixa o
volume em 50, foca o slider, dispara `ArrowUp`/`ArrowDown` e confere posição
(`audio.currentTime`) inalterada e `audio.volume` alterado.
Saída vermelha (sem a correção, tsx da entrega anterior): 2 failed —
`AssertionError: expected 5 to be +0` (a posição MEXEU no ↑, a colisão existe).
Saída verde (com a correção): Test Files 1 passed, Tests 8 passed.
Nota sobre o teste existente: a recusa manda literalmente "(b) deixar ↑/↓ para
o volume e tratar no slider só ←/→/Home/End" — por isso o caso de teclado
perdeu as expectativas de ↑/↓ movendo o seek, e o caso novo prova que ↑/↓ com
foco no slider movem só o volume.

Ponto 2 — live region `role="status"` sempre montada
O que mudei (mesmo tsx): o `role="status"` estava no `motion.div` que só monta
quando o status vira `processing`/`failed` — região inserida já com o texto não
é anunciada de forma confiável. Agora há um `<div role="status">` sempre montado
fora do `AnimatePresence` condicional, e o indicador entra/sai dentro dele (sem
`role` próprio). Para o rerender do teste refletir, o status exibido agora é
derivado: `statusLocal ?? initialStatus ?? 'pending'` — a prop do pai
(MessageBubble repassa `message.transcriptionStatus`, antes ignorado após o
mount) vale até o componente definir um estado local (realtime, transcrição
pedida aqui), sem `setState` dentro de efeito.
Teste que prova (mesmo arquivo →
"o status da transcrição é anunciado numa live region sempre montada"): render
sem status → `getByRole('status')` existe e está vazio; `rerender` com
`transcriptionStatus="processing"` → contém "Transcrevendo...".
Saída vermelha (sem a correção): o teste falha (1 dos 2 failed acima).
Saída verde: 8 passed.

Arquivos (git diff --name-only base...HEAD, colado):
src/components/inbox/AudioMessagePlayer.tsx
src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx

Verificações:
- npx vitest run src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx → Test Files 1 passed, Tests 8 passed
- vizinhos: useVolumeRocker + VolumeTriggerButton → Test Files 2 passed, Tests
  24 passed; transcricao + contrastePlayerSlider + MediaVolume → Test Files
  3 passed, Tests 46 passed
- diff do cartão: 2 arquivos, 20951 chars (< 90k); cherry-pick trouxe só estes 2
  arquivos (git show --stat 4689d801d).

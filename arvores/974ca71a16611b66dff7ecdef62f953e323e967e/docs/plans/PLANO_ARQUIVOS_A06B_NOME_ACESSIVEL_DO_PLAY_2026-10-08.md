# PLANO — NOME ACESSÍVEL DO BOTÃO DE PLAY NA ABA ARQUIVOS (A06b) — 1 ETAPA

> **Data:** 2026-10-08 · **Escopo:** front-end · **Sem DDL, Edge Function, migration nem dependência nova.**
> **Origem:** verificação visual do A06 (play de áudio no cartão), 08/10: tocar, pausar, um áudio por vez e troca de aba **passaram**. Achado: o botão tem rótulo genérico ("Tocar áudio" / "Pausar áudio"); com vários áudios o leitor de tela não distingue qual é qual.

## Decisão
- `src/components/inbox/tabs/AudioPlayButton.tsx`: o `aria-label` passa a incluir o nome do arquivo, ex.: "Tocar áudio audio-a1.wav" / "Pausar áudio audio-a1.wav" (nome truncado a ~60 caracteres; sem nome, mantém o rótulo atual). A barra de progresso também: "Progresso do áudio audio-a1.wav".
- **Não muda** o tamanho do botão (28 px): ele segue o mesmo padrão dos outros botões de ação da linha (olho, compartilhar, ⋮). Ampliar a área de toque no celular é decisão de design para TODOS os botões de ação do cartão, fora deste plano.
- Teste novo em `AudioPlayButton.test.tsx`: dois áudios com nomes diferentes têm rótulos diferentes; item sem nome mantém o rótulo antigo.

## Etapa única
- **A06b** [iris] aplicar o rótulo e o teste; `zapp-verify . --rapido` verde; arquivos permitidos: os dois citados acima.

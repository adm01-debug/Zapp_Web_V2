# Controles rápidos da sidebar — os 6 botões, o volume e os atalhos

> **Documento de estado real.** Descreve o que o **código de hoje** faz, lido arquivo por arquivo.
> Quando este texto e o código divergirem, o código manda — e a divergência é um defeito.
> Plano de origem: `docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md` (etapa S50).

## 1. Onde ficam e quantos são

Os controles rápidos moram no rodapé da sidebar, sob o cabeçalho **"Controles rápidos"**
(`src/components/layout/Sidebar.tsx`, bloco *Bottom Controls*). São **6 botões**, todos de
36 × 36 px:

- **Linha 1** (cinco, `gap-1` em linha, `flex-col` quando a sidebar está recolhida):
  `ScreenProtectionToggle` → `PushNotificationToggle` → `SoundVolumeControl` →
  `MediaVolumeToggle` → botão de **tema** (inline no `Sidebar.tsx`).
- **Linha 2** (um): `AccessibilitySettings`.

A acessibilidade fica em **linha própria** de propósito: 6 × 36 px + 5 gaps = 236 px não cabe
nos 228 px úteis da sidebar (256 px). A conta e a ordem estão comentadas no próprio
`Sidebar.tsx`.

## 2. O que cada um dos 6 botões faz

| # | Botão | Ícone | Arquivo | O que faz | Dica / rótulo | Ponto azul |
|---|-------|-------|---------|-----------|---------------|------------|
| 1 | **Cadeado** — proteção de tela | `Lock` / `LockOpen` | `src/components/notifications/ScreenProtectionToggle.tsx` | Liga/desliga a proteção de tela. Estado em `localStorage['screen-protection-enabled']` (padrão **ligado**), avisa o app pelo evento `screen-protection-change`. | `aria-label` e tooltip: "Desativar proteção de tela" (ligado) / "Ativar proteção de tela" (desligado) | Sim, quando **ligado** |
| 2 | **Sino** — notificações | `Bell` / `BellOff` / `Loader2` | `src/components/notifications/PushNotificationToggle.tsx` | Liga/desliga **tudo**: som + notificação do navegador + alerta de sentimento + notificação de transcrição, de uma vez, via `useNotificationSettings` (banco). | `aria-label` e tooltip: "Desativar todas as notificações" / "Ativar todas as notificações" | Sim, quando **ligado** |
| 3 | **Alto-falante** — volume dos **alertas** | `Volume2` (alto), `Volume1` (baixo), `VolumeX` (mudo) | `src/components/notifications/SoundVolumeControl.tsx` | Abre o painel de volume dos **sons de alerta** (WebAudio). Faixa 10–100 %, passo 5 %. Mudo é estado separado do volume (não zera ao mutar). | `aria-label`: "Volume dos alertas: N %" / "Sons de alerta mudos"; título do painel "Volume dos alertas" | Sim, quando **mudo** ou volume **< 30 %** |
| 4 | **Fone** — volume das **mídias** | `Headphones` / `HeadphoneOff` | `src/components/layout/MediaVolumeToggle.tsx` → `src/components/inbox/MediaVolumeControl.tsx` (`variant="sidebar"`) | Abre o painel de volume das **mídias de conversa** (áudio/vídeo das mensagens). Faixa 0–100 %, passo 5 %. | `aria-label`: "Volume dos áudios e vídeos: N %" / "Áudios e vídeos mudos"; título do painel "Volume dos áudios e vídeos" | Sim, quando **mudo** ou volume **< 30 %** |
| 5 | **Tema** | `Moon` (claro) / `Sun` (escuro) | `src/components/layout/Sidebar.tsx` (inline) | Alterna claro ↔ escuro (`setTheme` do `useTheme`). Preferência em `localStorage['theme']` (`light` / `dark` / `system`). | `aria-label` e tooltip: "Modo escuro" / "Modo claro" | Não (só o ícone fica em `text-primary` no escuro) |
| 6 | **Acessibilidade** | `Contrast` | `src/components/theme/HighContrastToggle.tsx` (`AccessibilitySettings`) | Abre o diálogo de acessibilidade: alto contraste, nível de contraste (75–150 %), reduzir movimento e texto grande. Cada opção em `localStorage` (`highContrast`, `contrastLevel`, `reducedMotion`, `largeText`). | `aria-label`: "Configurações de acessibilidade"; tooltip: "Acessibilidade — alto contraste, menos movimento, texto grande" | Não |

Nenhum dos 6 botões indica canal ou origem de mensagem/arquivo.

## 3. Como abrir o painel de volume

Vale igual para o **alto-falante** (alertas) e o **fone** (mídias). O gatilho é o
`VolumeTriggerButton` (`src/components/ui/VolumeTriggerButton.tsx`) e a interação vem do
`useVolumeRocker` (`src/hooks/ui/useVolumeRocker.ts`):

- **Clique simples** no ícone → **abre** o painel (decisão D01 do plano; antes o clique só mutava).
- **Clique longo (≥ 400 ms)** → também abre (mantido por compatibilidade, passo S18).
- **Enter** com o gatilho focado → abre.
- **Chevron** (seta) — só existe **fora** da sidebar (balão/overlay); na sidebar o próprio ícone é o gatilho.

O painel é um `Popover` do Radix (`src/components/ui/VolumeSliderPopoverContent.tsx`):
`role="dialog"` rotulado, valor em destaque (ex.: "70 %" / "Mudo"), slider vertical, botões
**− / +** de 5 % (alvos de 44 px para o toque) e um botão grande **Silenciar / Ativar som**.
O foco fica preso enquanto o painel está aberto. O `aria-valuetext` do thumb fala "70 por
cento" (ou "Mudo").

**Como fecha:** clique fora, **Esc** ou perda de foco (D02) — o foco volta ao gatilho. Soltar
o dedo no toque **não** fecha (corrige o bug B2): o `click` que o navegador dispara ao soltar
só reabre, o que é inofensivo.

## 4. Atalhos

Núcleo único no `useVolumeRocker` (compartilhado pelos dois controles; a lógica é a mesma com
o foco no botão ou em qualquer parte do player, quando há `playerRef`):

- **`M`** → mudo / desmudo.
- **↑ / ↓** → aumenta / diminui **5 %** (passo dos dois controles).
- **Enter** → abre o painel.
- **Esc** → fecha o painel.
- **Roda do mouse** → ajusta ±5 %, **só com o painel aberto** (B5: rolar a sidebar com o
  cursor sobre o ícone não muda mais o volume sem querer).
- Enquanto o foco está num campo de texto, as setas **não** são sequestradas.

## 5. Onde o volume é guardado

### Alertas — no banco (`user_settings`)

O volume dos alertas usa `useNotificationSettings`
(`src/hooks/system/useNotificationSettings.ts`) e persiste na tabela **`user_settings`**:

- `sound_enabled` (boolean) — mudo dos alertas (o clique no sino mexe neste campo).
- `sound_volume` (inteiro, **10–100**) — volume dos alertas.

Mudo e volume são **separados** (S39): mutar grava só `sound_enabled` e nunca zera o volume;
desmutar devolve o último volume escolhido, e o mínimo do slider (10) impede um 0 acidental.
A gravação é **agrupada** (~400 ms após o último movimento, `SAVE_DEBOUNCE_MS`): a tela anda na
hora e a rede grava no fim do gesto. Se a gravação falhar, o hook desfaz o otimista e avisa
uma vez; o painel mostra "Salvando…" sem travar o slider.

### Mídias — no navegador, por usuário

O volume das mídias é estado global em `src/lib/mediaVolumeStore.ts` (módulo puro, sem React),
persistido em **`localStorage` por usuário no aparelho** (D07/S33):

- Chaves por usuário: **`zapp.media.volume.<userId>`** e **`zapp.media.muted.<userId>`**.
- Chaves antigas (sem usuário): `zapp.media.volume` / `zapp.media.muted` — ainda valem para
  quem **não** está autenticado e são **migradas uma única vez** para o primeiro usuário
  resolvido (marca de migração `zapp.media.migrated`; S34). A chave antiga não é apagada às
  cegas e um valor próprio do usuário nunca é sobrescrito.
- Sincronização **entre abas**: `BroadcastChannel` `zapp-media-volume`, com fallback no evento
  `storage` (S35). Estado vindo de outra aba só é aplicado quando é do **mesmo** usuário.
- O `userId` vem da sessão que o `supabase-js` já guarda no `localStorage`
  (`sb-<ref>-auth-token`); login/logout entram em vigor sem recarregar a página.
- Padrão: **volume 80, mudo `false`**. Valores fora de 0–100, `NaN` ou lixo caem no padrão;
  escrita prende em 0–100 (as setas nunca "voltam ao padrão" por somar 5 ao 100).
- O ganho aplicado ao elemento é perceptual: `(volume/100)²` (`toGain`).

> **Sem DDL novo.** O volume das mídias não ganha coluna no banco: continua no navegador, agora
> por usuário. As chaves acima são o contrato de persistência observável.

## 6. O ponto azul

Um ponto `bg-primary` no canto do botão, com **dois significados** conforme o botão (B11):

- **Cadeado** e **sino**: ponto = **ligado** (proteção ativa / notificações ativas).
- **Alto-falante** e **fone**: ponto = **volume baixo ou mudo** (mudo **ou** < 30 %). A dica do
  `VolumeTriggerButton` traz a legenda: "Ponto azul: volume baixo ou mudo".

O botão de **tema** não tem ponto (só fica em `text-primary` no modo escuro).

## 7. Rótulos — fonte única

Os rótulos pt-BR ficam num só módulo, `src/lib/volumeLabels.ts`, e são importados pelos
componentes **e** pelo E2E. Renomear um rótulo quebra o **typecheck** (gate de PR) em vez de
quebrar em silêncio o E2E autenticado, que só roda depois.

- `SOUND_VOLUME_LABEL` = "Volume dos alertas" (+ `: N %` pelo componente);
  `SOUND_VOLUME_LABEL_MUTED` = "Sons de alerta mudos"; `SOUND_VOLUME_SLIDER_LABEL` = "Volume dos alertas".
- `MEDIA_VOLUME_LABEL` = "Volume dos áudios e vídeos" (+ `: N %`);
  `MEDIA_VOLUME_LABEL_MUTED` = "Áudios e vídeos mudos"; `MEDIA_VOLUME_SLIDER_LABEL` = "Volume dos áudios e vídeos".

## 8. Arquivos

| Papel | Arquivo |
|-------|---------|
| Layout e os 6 botões (tema inline) | `src/components/layout/Sidebar.tsx` |
| Cadeado | `src/components/notifications/ScreenProtectionToggle.tsx` |
| Sino | `src/components/notifications/PushNotificationToggle.tsx` |
| Preferências de notificação (banco) | `src/hooks/system/useNotificationSettings.ts` |
| Alto-falante (alertas) | `src/components/notifications/SoundVolumeControl.tsx` |
| Fone (mídias) | `src/components/layout/MediaVolumeToggle.tsx`, `src/components/inbox/MediaVolumeControl.tsx` |
| Persistência das mídias | `src/lib/mediaVolumeStore.ts`, `src/hooks/communication/useMediaVolume.ts` |
| Acessibilidade | `src/components/theme/HighContrastToggle.tsx` (`AccessibilitySettings`) |
| Tema | `src/hooks/ui/useTheme.ts` |
| Gatilho e interação compartilhados | `src/components/ui/VolumeTriggerButton.tsx`, `src/hooks/ui/useVolumeRocker.ts`, `src/components/ui/VolumeSliderPopoverContent.tsx` |
| Rótulos | `src/lib/volumeLabels.ts` |

## 9. Testes que provam

- Unitários de componente/hook:
  `src/components/layout/__tests__/Sidebar.test.tsx`,
  `src/components/notifications/__tests__/SoundVolumeControl.test.tsx`,
  `src/components/ui/__tests__/VolumeTriggerButton.test.tsx`,
  `src/components/inbox/__tests__/MediaVolume.test.tsx`,
  `src/hooks/ui/__tests__/useVolumeRocker.test.tsx`,
  `src/components/theme/__tests__/HighContrastToggle.test.tsx`.
- Unitários do estado de mídia:
  `src/lib/__tests__/mediaVolumeStore.test.ts`,
  `src/lib/__tests__/mediaVolumeElement.test.ts`.
- Contratos:
  `tests/contracts/media-volume-surfaces.contract.test.ts` (toda superfície de conversa passa
  pelo controle único; isenções explícitas),
  `tests/contracts/alert-sound-persistence.contract.test.ts`,
  `tests/contracts/notification-sound-persistence.contract.test.ts`.
- Ponta a ponta: `e2e/media-volume.spec.ts` e `e2e/quick-controls-volume.spec.ts`.

## 10. Fora de escopo

Mudar o som/ganho dos alertas; equalizador; coluna nova no banco para o volume das mídias.
O teto de ganho do toque de chamada recebida (`soundVolume/100 × 0,2`) é tratado em cartão
próprio (Q10) e não é alterado aqui.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato das superfícies de mídia de conversa.
 *
 * O plano de volume de mídia mapeou 9 superfícies (áudio de mensagem, vídeo no balão,
 * vídeo em tela cheia, galeria, status/stories, chat interno, player de transcrições,
 * gravação de chamada e prévias de TTS/voice changer/memes). Todas precisam respeitar
 * o controle ÚNICO (`mediaVolumeStore` via `useMediaElementVolume`/`useMediaVolume`):
 * um player que nasça fora dele toca no volume cheio e o slider mente.
 *
 * Antes de uma superfície nova entrar sem o controle, este contrato quebra.
 */
describe('volume de mídia — toda superfície de conversa passa pelo controle único', () => {
  const superfícies: Array<[string, string]> = [
    ['áudio de mensagem', 'src/hooks/communication/useAudioPlayer.ts'],
    ['vídeo no balão', 'src/components/inbox/MediaPreview.tsx'],
    ['vídeo em tela cheia', 'src/components/inbox/VideoFullscreen.tsx'],
    ['galeria de mídia', 'src/components/inbox/media-gallery/MediaPreviewDialog.tsx'],
    ['status/stories', 'src/components/inbox/contact-details/StoryViewer.tsx'],
    ['chat interno da equipe', 'src/components/team-chat/TeamChatPanel.tsx'],
    ['transcrições (autoplay)', 'src/components/transcriptions/TranscriptionContactGroup.tsx'],
    ['gravação de chamada', 'src/components/calls/VoIPPanel.tsx'],
  ];

  it.each(superfícies)('%s usa o controle único', (_nome, arquivo) => {
    const fonte = read(arquivo);
    expect(
      /useMediaElementVolume|useMediaVolume\b/.test(fonte),
      `${arquivo} precisa aplicar o volume de mídia global`,
    ).toBe(true);
  });

  it('as prévias de voz/TTS também usam o controle único', () => {
    for (const arquivo of [
      'src/components/inbox/TextToAudioButton.tsx',
      'src/components/inbox/VoiceChanger.tsx',
      'src/components/inbox/VoiceChangerPicker.tsx',
      'src/hooks/communication/useAudioMemes.ts',
      'src/hooks/voice/playTtsAudio.ts',
    ]) {
      const fonte = read(arquivo);
      expect(/useMediaElementVolume|useMediaVolume\b|applyMediaVolume|attachMediaVolume/.test(fonte), arquivo).toBe(true);
    }
  });
});

/**
 * Isentas por decisão documentada: sons de ALERTA não entram no controle de mídia
 * (o atendente não pode silenciar alerta sem querer) e a biblioteca de mídia do
 * admin é gestão de arquivo, não conversa. O contrato garante que a isenção continue
 * EXPLÍCITA no código — quem tirar o comentário e plugar o controle quebra aqui.
 */
describe('volume de mídia — isenções explícitas, não silenciosas', () => {
  const isentas: Array<[string, string]> = [
    ['alerta de rate limit', 'src/utils/securityAlertSound.ts'],
    ['alerta de war room', 'src/hooks/business/useWarRoomAlerts.ts'],
    ['alerta do chat interno', 'src/hooks/chat/useTeamChatNotifications.ts'],
    // E37 — mídia que NÃO é de conversa: o laboratório de voz (preview de voz e diálogo
    // TTS, ambos nas Configurações) e a biblioteca de mídia do admin (gestão de arquivo).
    // Nesses `<audio controls>`/`new Audio()` quem manda no volume é o próprio elemento
    // nativo, e ninguém no atendimento depende deles para ouvir o cliente. A isenção é
    // registrada no plano (docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md, E37).
    ['preview de voz (laboratório)', 'src/components/voice/ElevenLabsVoiceDesign.tsx'],
    ['diálogo TTS (laboratório)', 'src/components/voice/ElevenLabsDialogue.tsx'],
    ['geração de SFX (biblioteca do admin)', 'src/components/settings/media-library/AIGenerateDialog.tsx'],
    ['prévia da biblioteca do admin', 'src/components/settings/media-library/useMediaLibrary.ts'],
  ];

  it.each(isentas)('%s não usa o controle e diz por quê', (_nome, arquivo) => {
    const fonte = read(arquivo);
    expect(fonte, `${arquivo} não deve entrar no controle de mídia`).not.toMatch(
      /useMediaElementVolume|useMediaVolume\b/,
    );
    expect(fonte, `${arquivo} precisa documentar a isenção`).toContain('mediaVolumeStore');
  });

  // O componente continua fora do controle de volume de mídia, mesmo depois de o som
  // (e a isenção documentada) morarem no módulo `@/utils/securityAlertSound`.
  it('o componente do alerta de rate limit não entra no controle de mídia', () => {
    const fonte = read('src/components/security/RateLimitRealtimeAlerts.tsx');

    expect(fonte).not.toMatch(/useMediaElementVolume|useMediaVolume\b/);
  });
});

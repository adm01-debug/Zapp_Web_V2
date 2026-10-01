import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato do "tipo de som" por alerta.
 *
 * O campo legado `soundType` (um valor único, nunca gravado no banco) duplicava o
 * som de mensagem e fazia o painel mentir: escolher "Sino" e recarregar voltava
 * para "Chime", e SLA/meta tocavam o tipo errado. Cada alerta agora usa a SUA
 * coluna persistida em `user_settings`
 * (`message|mention|sla|goal|transcription_sound_type`).
 *
 * Antes da correção estes testes falham.
 */
describe('tipo de som por alerta — persistido no banco, nunca só em memória', () => {
  const hook = read('src/hooks/system/useNotificationSettings.ts');
  const painel = read('src/components/notifications/NotificationSettingsPanel.tsx');

  it('o hook não expõe mais o campo legado `soundType`', () => {
    expect(hook).not.toMatch(/soundType:\s*SoundTypeOption/);
    expect(hook).not.toMatch(/soundType:\s*'chime'/);
  });

  it('o hook lê e grava as cinco colunas por categoria', () => {
    const pares: Array<[string, string]> = [
      ['messageSoundType', 'message_sound_type'],
      ['mentionSoundType', 'mention_sound_type'],
      ['slaSoundType', 'sla_sound_type'],
      ['goalSoundType', 'goal_sound_type'],
      ['transcriptionSoundType', 'transcription_sound_type'],
    ];
    for (const [campo, coluna] of pares) {
      // A leitura passa por `toSoundType(...)`: além de cada categoria ler a SUA coluna, o valor
      // é validado contra o vocabulário (um valor fora do conjunto fazia o alerta ficar mudo).
      expect(hook, `leitura de ${coluna}`).toContain(`${campo}: toSoundType(data.${coluna}`);
      expect(hook, `gravacao de ${coluna}`).toContain(`dbUpdates.${coluna} = updates.${campo}`);
    }
  });

  it('SLA e meta tocam o som da própria categoria', () => {
    expect(read('src/hooks/sla/useSLANotifications.ts'))
      .toContain("playNotificationSound('sla_breach', settings.slaSoundType, settings.soundVolume)");
    expect(read('src/hooks/analytics/useGoalNotifications.ts'))
      .toContain("playNotificationSound('goal_achieved', settings.goalSoundType, settings.soundVolume)");
  });

  it('o painel não escreve o campo legado e previsualiza o som da mensagem', () => {
    expect(painel).not.toMatch(/updateSettings\(\{\s*soundType/);
    expect(painel).toContain('previewSound(settings.messageSoundType, settings.soundVolume)');
  });
});

/**
 * O volume dos alertas é ÚNICO: `settings.soundVolume` (coluna `sound_volume`).
 * Havia um segundo módulo de som (`@/utils/notificationSound`) sem noção de volume,
 * usado por quatro caminhos — esses alertas tocavam sempre no volume cheio. O
 * módulo foi removido e os quatro caminhos passaram a usar a util com volume.
 */
describe('volume dos alertas — uma única fonte, em todos os caminhos', () => {
  it('o módulo de som duplicado (sem volume) não existe mais', () => {
    expect(existsSync('src/utils/notificationSound.ts')).toBe(false);
    expect(existsSync('src/utils/__tests__/notificationSound.test.ts')).toBe(false);
  });

  it('nenhum arquivo importa o módulo removido', () => {
    const fontes = [
      'src/hooks/realtime/useRealtimeNotifications.ts',
      'src/hooks/communication/useTranscriptionNotifications.ts',
      'src/hooks/inbox/useSentimentAlerts.ts',
      'src/hooks/inbox/useRealtimeSentimentAlerts.ts',
      'src/hooks/sla/useSLANotifications.ts',
      'src/hooks/analytics/useGoalNotifications.ts',
      'src/components/notifications/NotificationSettingsPanel.tsx',
      'src/components/notifications/NotificationTypeCards.tsx',
    ];
    for (const fonte of fontes) {
      expect(read(fonte), fonte).not.toContain("from '@/utils/notificationSound'");
      expect(read(fonte), fonte).toContain("from '@/utils/notificationSounds'");
    }
  });

  it('os quatro caminhos legados passam tipo persistido + volume para o som', () => {
    const esperado: Array<[string, string]> = [
      [
        'src/hooks/realtime/useRealtimeNotifications.ts',
        "playNotificationSound('message', notifSettings.messageSoundType, notifSettings.soundVolume)",
      ],
      [
        'src/hooks/communication/useTranscriptionNotifications.ts',
        "playNotificationSound('message', settings.transcriptionSoundType, settings.soundVolume)",
      ],
      [
        'src/hooks/inbox/useSentimentAlerts.ts',
        "playNotificationSound('mention', settings.mentionSoundType, settings.soundVolume)",
      ],
      [
        'src/hooks/inbox/useRealtimeSentimentAlerts.ts',
        "playNotificationSound('mention', settings.mentionSoundType, settings.soundVolume)",
      ],
    ];
    for (const [fonte, chamada] of esperado) {
      expect(read(fonte), fonte).toContain(chamada);
    }
  });

  it('nenhuma chamada de som ficou sem volume', () => {
    const fontes = [
      'src/hooks/realtime/useRealtimeNotifications.ts',
      'src/hooks/communication/useTranscriptionNotifications.ts',
      'src/hooks/inbox/useSentimentAlerts.ts',
      'src/hooks/inbox/useRealtimeSentimentAlerts.ts',
      'src/hooks/sla/useSLANotifications.ts',
      'src/hooks/analytics/useGoalNotifications.ts',
    ];
    for (const fonte of fontes) {
      for (const linha of read(fonte).split('\n')) {
        if (!linha.includes('playNotificationSound(')) continue;
        if (linha.includes("from '@/utils/notificationSounds'")) continue;
        expect(linha, `${fonte}: ${linha.trim()}`).toMatch(/soundVolume|soundVolume\)/);
      }
    }
  });
});

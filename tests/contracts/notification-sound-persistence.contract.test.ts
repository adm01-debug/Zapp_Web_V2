import { readFileSync } from 'node:fs';
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
      expect(hook, `leitura de ${coluna}`).toContain(`${campo}: (data.${coluna}`);
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

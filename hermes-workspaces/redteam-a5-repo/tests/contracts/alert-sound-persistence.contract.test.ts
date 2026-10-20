/**
 * Contrato: som de ALERTA não é mídia de conversa.
 *
 * Regra da casa (decisão registrada): alertas ficam FORA do `mediaVolumeStore` — o
 * atendente não pode silenciar alerta sem querer mexendo no volume das conversas. Isso
 * NÃO quer dizer volume fixo: cada alerta obedece ao volume de alerta do painel
 * (`user_settings.sound_volume`, 10-100), nunca a um número cravado no código.
 *
 * Este contrato pina as duas metades da regra. Ele quebra se alguém:
 *   - voltar a cravar `.volume = 0.5` / `0.4`;
 *   - ligar um alerta ao controle de volume de mídia;
 *   - deixar de ler o volume persistido.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..');

const ALERTAS = [
  'src/components/security/RateLimitRealtimeAlerts.tsx',
  'src/hooks/business/useWarRoomAlerts.ts',
  'src/hooks/team-chat/useTeamChatNotifications.ts',
] as const;

function ler(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf8');
}

describe('contrato: som de alerta com volume do painel', () => {
  it.each(ALERTAS)('%s não crava volume fixo no código', (rel) => {
    const src = ler(rel);

    expect(src).not.toMatch(/\.volume\s*=\s*0?\.\d/);
  });

  it.each(ALERTAS)('%s lê o volume persistido do painel', (rel) => {
    const src = ler(rel);

    expect(src).toMatch(/soundVolume/);
  });

  it.each(ALERTAS)('%s continua fora do controle de volume de mídia', (rel) => {
    const src = ler(rel);

    expect(src).not.toMatch(
      /import[^\n]*(useMediaElementVolume|useMediaVolume|mediaVolumeStore|applyMediaVolume|attachMediaVolume)/,
    );
  });

  it('Normaliza 10-100 para ganho 0.1-1.0 (mesma faixa do painel e do slider)', () => {
    const src = ler('src/hooks/business/useWarRoomAlerts.ts');

    expect(src).toMatch(/settings\.soundVolume\s*\/\s*100/);
  });

  it('O util de som de segurança é ganho puro: 10-100 -> 0.1-1.0, sem valor fixo', () => {
    const src = ler('src/utils/securityAlertSound.ts');

    expect(src).not.toMatch(/\.volume\s*=\s*0?\.\d/);
    expect(src).toMatch(/audio\.volume = volume \/ 100/);
  });

  it('O alerta de segurança recebe o volume por parâmetro (função pura de ganho)', () => {
    const util = ler('src/utils/securityAlertSound.ts');
    const componente = ler('src/components/security/RateLimitRealtimeAlerts.tsx');

    expect(util).toMatch(/export function playAlertSound\(volume: number\)/);
    expect(util).toMatch(/audio\.volume = volume \/ 100/);
    expect(componente).toMatch(/import \{ playAlertSound \} from '@\/utils\/securityAlertSound'/);
    expect(componente).toMatch(/playAlertSound\(soundVolumeRef\.current\)/);
  });
});

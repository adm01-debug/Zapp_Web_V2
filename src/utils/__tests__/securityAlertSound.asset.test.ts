import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_ALERT_SOUND_URL } from '@/utils/securityAlertSound';

/**
 * Bug provado em auditoria: `playAlertSound` tocava `new Audio('/notification.mp3')`, mas
 * NENHUM `.mp3` existia no repositório — o alerta de segurança era MUDO.
 *
 * Este teste falha se o arquivo sumir do `public/`. Como o Vite copia `public/*` para `dist/`,
 * presença em `public/` é a garantia de presença no build (verificado também com `dist/`).
 */
describe('alerta de segurança — o arquivo de som existe no build', () => {
  it('o caminho usado no código aponta para um arquivo real em public/', () => {
    expect(SECURITY_ALERT_SOUND_URL.startsWith('/')).toBe(true);

    const relativo = SECURITY_ALERT_SOUND_URL.replace(/^\//, '');
    const arquivo = join(process.cwd(), 'public', relativo);

    expect(existsSync(arquivo), `arquivo ausente: public${SECURITY_ALERT_SOUND_URL}`).toBe(true);
    expect(statSync(arquivo).size).toBeGreaterThan(0);
  });
});

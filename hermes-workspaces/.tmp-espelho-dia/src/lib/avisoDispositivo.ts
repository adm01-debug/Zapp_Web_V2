import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/**
 * Aviso de "novo dispositivo" no login (correção 14/10/2026).
 *
 * Antes, `detect-new-device` só era chamado quando o usuário abria a tela de
 * Segurança (useDeviceDetection): o e-mail de alerta nunca saía no caso de roubo
 * de credencial, quando ele mais importa. Agora o provider de autenticação
 * dispara o aviso no boot (sessão já aberta) e no SIGNED_IN, uma única vez por
 * sessão Auth.
 *
 * A guarda usa o `session_id` do JWT de acesso — a mesma sessão que o servidor
 * deriva do token (nunca do corpo da requisição). O marcador e o `device_id`
 * devolvido ficam em sessionStorage, que sobrevive a recarregamentos da aba; o
 * useDeviceDetection reaproveita esse resultado para não existir uma segunda
 * chamada na mesma sessão.
 */
const CHAVE_AVISO_DISPOSITIVO = 'zapp:aviso-dispositivo:';

interface AvisoDispositivo {
  deviceId: string | null;
}

/** Lê o claim `session_id` do JWT de acesso (a assinatura é validada no servidor). */
export function extrairSessionIdDoToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const partes = accessToken.split('.');
    if (partes.length !== 3) return null;
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const completado = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(completado)) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && claims.session_id.length > 0
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

/** Impressão digital do dispositivo (canvas + agente + tela), como o servidor espera. */
export function gerarImpressaoDispositivo(): string {
  let impressaoCanvas = '';
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('fingerprint', 2, 2);
    }
    impressaoCanvas = canvas.toDataURL();
  } catch {
    // Ambiente sem canvas: os demais componentes ainda identificam o dispositivo.
    impressaoCanvas = '';
  }

  const componentes = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    `${screen.width}x${screen.height}`,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    impressaoCanvas,
  ];

  const hash = componentes.join('|').split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  return Math.abs(hash).toString(36);
}

/** Navegador, sistema e nome amigável do dispositivo a partir do agente. */
export function infoDoNavegador(): { browser: string; os: string; deviceName: string } {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Opera')) browser = 'Opera';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const deviceName = isMobile ? 'Dispositivo Móvel' : 'Desktop';

  return { browser, os, deviceName };
}

function lerAvisoDeDispositivo(sessionId: string): AvisoDispositivo | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const bruto = sessionStorage.getItem(CHAVE_AVISO_DISPOSITIVO + sessionId);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as { deviceId?: unknown };
    return { deviceId: typeof dados.deviceId === 'string' ? dados.deviceId : null };
  } catch {
    return null;
  }
}

function gravarAvisoDeDispositivo(sessionId: string, deviceId: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(CHAVE_AVISO_DISPOSITIVO + sessionId, JSON.stringify({ deviceId }));
  } catch {
    // sessionStorage indisponível: a guarda em memória desta carga já basta.
  }
}

/** Promessas do aviso por sessão Auth — duas chamadas concorrentes não duplicam o e-mail. */
const avisoDeDispositivoEmVoo = new Map<string, Promise<string | null>>();

async function executarAvisoDeDispositivo(sessionId: string): Promise<string | null> {
  // Marca ANTES do await: boot + SIGNED_IN (ou StrictMode) não podem gerar dois
  // alertas. Falha também é definitiva nesta sessão — o aviso nunca bloqueia o login.
  gravarAvisoDeDispositivo(sessionId, null);
  try {
    const { data, error } = await supabase.functions.invoke('detect-new-device', {
      body: {
        device_fingerprint: gerarImpressaoDispositivo(),
        browser: infoDoNavegador().browser,
        os: infoDoNavegador().os,
        device_name: infoDoNavegador().deviceName,
      },
    });
    if (error) throw error;
    const deviceId = typeof data?.device_id === 'string' ? data.device_id : null;
    gravarAvisoDeDispositivo(sessionId, deviceId);
    return deviceId;
  } catch (err) {
    log.warn('[AuthProvider] Aviso de novo dispositivo falhou (login segue normalmente):', err);
    return null;
  }
}

/**
 * Dispara o aviso de novo dispositivo UMA vez por sessão Auth e devolve o
 * `device_id` (ou null). Falha silenciosa: o login nunca é bloqueado por isso.
 */
export function notificarDispositivoNovo(accessToken: string | null | undefined): Promise<string | null> {
  const sessionId = extrairSessionIdDoToken(accessToken);
  if (!sessionId) return Promise.resolve(null);

  const emMemoria = avisoDeDispositivoEmVoo.get(sessionId);
  if (emMemoria) return emMemoria;

  const jaAvisado = lerAvisoDeDispositivo(sessionId);
  if (jaAvisado) {
    const concluido = Promise.resolve(jaAvisado.deviceId);
    avisoDeDispositivoEmVoo.set(sessionId, concluido);
    return concluido;
  }

  const promessa = executarAvisoDeDispositivo(sessionId);
  avisoDeDispositivoEmVoo.set(sessionId, promessa);
  return promessa;
}

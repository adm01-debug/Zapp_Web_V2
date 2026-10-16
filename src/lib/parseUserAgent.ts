/**
 * `parseUserAgent` — classificação do agente do usuário (HZ3-009-A).
 *
 * A detecção antiga (`infoDoNavegador`, em `avisoDispositivo.ts`) testava
 * `ua.includes('Chrome')` antes de Edge/Opera (as duas têm "Chrome" na UA e
 * viravam "Chrome"), `ua.includes('Linux')` antes de Android (Android virava
 * "Linux") e `ua.includes('Mac')` antes de iPhone/iPad (o iPhone traz
 * "like Mac OS X" e virava "macOS"). A lista de dispositivos e o e-mail de
 * novo dispositivo (`detect-new-device`) mostravam o dispositivo errado.
 *
 * Aqui a ordem dos testes é a regra: motores derivados (Edge, Opera, Samsung
 * Internet, Chrome no iOS) antes do motor base, e sistemas móveis antes de
 * Linux/macOS. Função pura, sem `navigator` — o agente entra por parâmetro.
 */

export type NavegadorDetectado =
  | 'Edge'
  | 'Opera'
  | 'Firefox'
  | 'Samsung Internet'
  | 'Chrome'
  | 'Safari'
  | 'Unknown';

export type SistemaDetectado =
  | 'Windows'
  | 'macOS'
  | 'iPadOS'
  | 'iOS'
  | 'Android'
  | 'Linux'
  | 'Unknown';

export interface InfoNavegador {
  browser: NavegadorDetectado;
  os: SistemaDetectado;
  deviceName: 'Desktop' | 'Dispositivo Móvel';
}

/** Detecta o navegador testando os derivados do Chromium ANTES de "Chrome". */
function detectarNavegador(ua: string): NavegadorDetectado {
  if (/Edg[AE]?\//.test(ua) || /Edge\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua) || /Opera[ /]/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown';
}

/**
 * Detecta o sistema testando os móveis ANTES de Linux/macOS: o Android traz
 * "Linux" na UA e o iPhone/iPad trazem "like Mac OS X".
 */
function detectarSistema(ua: string): SistemaDetectado {
  if (/iPhone|iPod/.test(ua)) return 'iOS';
  if (/iPad/.test(ua)) return 'iPadOS';
  // iPadOS 13+ se identifica como desktop ("Macintosh") e mantém o token
  // "Mobile" (os Macs não o enviam): é iPad, não macOS.
  if (/Macintosh/.test(ua) && /Mobile\//.test(ua)) return 'iPadOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return 'Unknown';
}

/** Navegador, sistema e nome amigável do dispositivo a partir do agente. */
export function parseUserAgent(ua: string): InfoNavegador {
  const agente = typeof ua === 'string' ? ua : '';
  const dispositivoMovel = /Mobile|Android|iPhone|iPad|iPod/.test(agente);

  return {
    browser: detectarNavegador(agente),
    os: detectarSistema(agente),
    deviceName: dispositivoMovel ? 'Dispositivo Móvel' : 'Desktop',
  };
}

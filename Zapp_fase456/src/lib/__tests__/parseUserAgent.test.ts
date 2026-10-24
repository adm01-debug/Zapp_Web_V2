import { describe, it, expect } from 'vitest';
import { parseUserAgent } from '@/lib/parseUserAgent';

/**
 * HZ3-009-A: `parseUserAgent` tem de classificar o agente do usuário SEM a
 * ordem errada que existia em `infoDoNavegador` (Edge/Opera viram "Chrome",
 * Android vira "Linux", iPhone vira "macOS"). Cada caso abaixo é um UA real.
 */

interface Caso {
  nome: string;
  ua: string;
  browser: string;
  os: string;
  deviceName: 'Desktop' | 'Dispositivo Móvel';
}

const CASOS: Caso[] = [
  {
    nome: 'Edge no Windows (Chromium, tem "Chrome" na UA)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
    browser: 'Edge',
    os: 'Windows',
    deviceName: 'Desktop',
  },
  {
    nome: 'Opera no Windows (tem "Chrome" e "OPR/")',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
    browser: 'Opera',
    os: 'Windows',
    deviceName: 'Desktop',
  },
  {
    nome: 'Chrome no Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    browser: 'Chrome',
    os: 'Linux',
    deviceName: 'Desktop',
  },
  {
    nome: 'Firefox no Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    browser: 'Firefox',
    os: 'Windows',
    deviceName: 'Desktop',
  },
  {
    nome: 'Safari no macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    browser: 'Safari',
    os: 'macOS',
    deviceName: 'Desktop',
  },
  {
    nome: 'Chrome no macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    browser: 'Chrome',
    os: 'macOS',
    deviceName: 'Desktop',
  },
  {
    nome: 'Chrome no Android (tem "Linux" na UA — não pode virar Linux)',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    browser: 'Chrome',
    os: 'Android',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Samsung Internet no Android',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    browser: 'Samsung Internet',
    os: 'Android',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Edge no Android (EdgA/)',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 EdgA/119.0.0.0',
    browser: 'Edge',
    os: 'Android',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Safari no iPhone (tem "like Mac OS X" — não pode virar macOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    browser: 'Safari',
    os: 'iOS',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Chrome no iPhone (CriOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1',
    browser: 'Chrome',
    os: 'iOS',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Safari no iPad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    browser: 'Safari',
    os: 'iPadOS',
    deviceName: 'Dispositivo Móvel',
  },
  {
    nome: 'Safari no iPadOS 13+ (UA de desktop com "Macintosh" + "Mobile")',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    browser: 'Safari',
    os: 'iPadOS',
    deviceName: 'Dispositivo Móvel',
  },
];

describe('parseUserAgent', () => {
  it.each(CASOS)('$nome', ({ ua, browser, os, deviceName }) => {
    expect(parseUserAgent(ua)).toEqual({ browser, os, deviceName });
  });

  it('agente desconhecido/vazio não inventa navegador nem sistema', () => {
    expect(parseUserAgent('')).toEqual({ browser: 'Unknown', os: 'Unknown', deviceName: 'Desktop' });
    expect(parseUserAgent('curl/8.4.0')).toEqual({ browser: 'Unknown', os: 'Unknown', deviceName: 'Desktop' });
  });

  it('regressão HZ3-009-A: os três erros do legado não voltam', () => {
    const edgeWindows = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
    );
    expect(edgeWindows.browser).not.toBe('Chrome');

    const android = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    );
    expect(android.os).not.toBe('Linux');

    const iphone = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    );
    expect(iphone.os).not.toBe('macOS');
  });
});

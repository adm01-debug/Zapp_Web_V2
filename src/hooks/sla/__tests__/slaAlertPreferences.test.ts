/**
 * Preferências de alerta de SLA — contrato puro (`slaAlertPreferences`).
 *
 * Regras provadas: default da tabela (tudo ligado), linha parcial/nula caindo no default, a chave
 * geral fechando todos os avisos, e cada tipo/severidade decidindo só o seu próprio aviso.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SLA_ALERT_PREFERENCES,
  isSlaAlertSeverity,
  isSlaAlertType,
  normalizeSlaAlertPreferences,
  slaAlertAllowed,
} from '../slaAlertPreferences';

describe('normalizeSlaAlertPreferences', () => {
  it('sem linha (usuário novo) devolve o default da tabela', () => {
    expect(normalizeSlaAlertPreferences(null)).toEqual({ ...DEFAULT_SLA_ALERT_PREFERENCES });
    expect(normalizeSlaAlertPreferences(undefined)).toEqual({ ...DEFAULT_SLA_ALERT_PREFERENCES });
  });

  it('linha parcial ou com nulo cai no default do campo', () => {
    const prefs = normalizeSlaAlertPreferences({ enabled: false, severity_warning: null });
    expect(prefs.enabled).toBe(false);
    expect(prefs.severityWarning).toBe(true);
    expect(prefs.severityBreached).toBe(true);
  });

  it('lê as colunas snake_case do banco', () => {
    const prefs = normalizeSlaAlertPreferences({
      user_id: 'u1',
      enabled: true,
      alert_first_response: false,
      alert_resolution: true,
      severity_warning: false,
      severity_breached: true,
    });
    expect(prefs).toEqual({
      enabled: true,
      alertFirstResponse: false,
      alertResolution: true,
      severityWarning: false,
      severityBreached: true,
    });
  });
});

describe('slaAlertAllowed', () => {
  it('com tudo ligado todo aviso sai', () => {
    for (const type of ['first_response', 'resolution'] as const) {
      for (const severity of ['warning', 'breached'] as const) {
        expect(slaAlertAllowed(DEFAULT_SLA_ALERT_PREFERENCES, { type, severity })).toBe(true);
      }
    }
  });

  it('chave geral desligada fecha todos os avisos', () => {
    const prefs = { ...DEFAULT_SLA_ALERT_PREFERENCES, enabled: false };
    expect(slaAlertAllowed(prefs, { type: 'first_response', severity: 'breached' })).toBe(false);
    expect(slaAlertAllowed(prefs, { type: 'resolution', severity: 'warning' })).toBe(false);
  });

  it('tipo desligado não fecha o outro tipo', () => {
    const prefs = { ...DEFAULT_SLA_ALERT_PREFERENCES, alertFirstResponse: false };
    expect(slaAlertAllowed(prefs, { type: 'first_response', severity: 'breached' })).toBe(false);
    expect(slaAlertAllowed(prefs, { type: 'resolution', severity: 'breached' })).toBe(true);
  });

  it('severidade desligada não fecha a outra severidade', () => {
    const prefs = { ...DEFAULT_SLA_ALERT_PREFERENCES, severityWarning: false };
    expect(slaAlertAllowed(prefs, { type: 'first_response', severity: 'warning' })).toBe(false);
    expect(slaAlertAllowed(prefs, { type: 'first_response', severity: 'breached' })).toBe(true);
  });
});

describe('guardas de tipo e severidade', () => {
  it('aceita só os valores do contrato da tabela', () => {
    expect(isSlaAlertType('first_response')).toBe(true);
    expect(isSlaAlertType('resolution')).toBe(true);
    expect(isSlaAlertType('outro')).toBe(false);
    expect(isSlaAlertSeverity('warning')).toBe(true);
    expect(isSlaAlertSeverity('breached')).toBe(true);
    expect(isSlaAlertSeverity('critico')).toBe(false);
  });
});

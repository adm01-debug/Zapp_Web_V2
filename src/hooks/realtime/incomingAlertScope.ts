/**
 * Ponto ÚNICO da decisão "esta mensagem nova deve me avisar?".
 *
 * O caminho do inbox (`useRealtimeMessages` -> `notifyAboutIncomingMessage`) e o
 * aviso global (`useGlobalIncomingMessageAlerts`, montado em `App.tsx`/
 * `DeferredProviders`) chamam a MESMA função: se a regra morasse em cada canal,
 * ela valeria num só.
 *
 * A identidade (profiles.id — o valor de `contacts.assigned_to`, nunca o auth
 * user id) é PUBLICADA por quem tem o dado (`profile.id`, que `App.tsx` lê de
 * `useAuth`) e lida aqui do módulo. O `useRealtimeNotifications` é usado por
 * telas e testes que não têm o AuthProvider em volta: pedir o contexto ali seria
 * um contrato novo e quebraria consumidores que hoje só precisam de notificação.
 */
import { useCallback, useEffect, useState } from 'react';

/** Chave local da opção "avisar também da equipe" (supervisor). */
export const TEAM_ALERTS_STORAGE_KEY = 'zapp:avisar-tambem-da-equipe';

export interface IncomingAlertScope {
  myProfileId: string | null;
  /** Supervisor: avisar também das conversas de outros atendentes. Desligada por padrão. */
  teamAlerts: boolean;
}

export interface AlertableContact {
  assigned_to?: string | null;
}

/** Lê a preferência salva. Sem storage (SSR/teste sem jsdom) o padrão é DESLIGADO. */
function lerTeamAlertsSalvo(): boolean {
  try {
    return globalThis.localStorage?.getItem(TEAM_ALERTS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let scope: IncomingAlertScope = { myProfileId: null, teamAlerts: lerTeamAlertsSalvo() };

/** Publica a identidade de quem está logado (o dono das conversas que avisam). */
export function setAlertProfileId(profileId: string | null): void {
  if (scope.myProfileId === profileId) return;
  scope = { ...scope, myProfileId: profileId };
}

export function getIncomingAlertScope(): IncomingAlertScope {
  return scope;
}

/**
 * Liga/desliga o aviso das conversas da equipe (supervisor) e grava a escolha.
 *
 * Quem chama é o interruptor do painel de notificações, via
 * `useTeamAlertsPreference` — a preferência é do usuário, então persiste local
 * (`localStorage`): a coluna em `user_settings` é trilha de banco, que este
 * cartão não abre.
 */
export function setTeamAlertsEnabled(enabled: boolean): void {
  scope = { ...scope, teamAlerts: enabled };
  try {
    globalThis.localStorage?.setItem(TEAM_ALERTS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* sem storage: a escolha vale só nesta sessão */
  }
}

/**
 * Preferência "avisar também da equipe", para o interruptor do painel.
 *
 * Devolve o valor atual e um setter que mantém o módulo e a tela em sincronia.
 * Na montagem relê o valor salvo: se outra aba (ou outra montagem) tiver mudado,
 * o interruptor não fica mostrando o valor velho.
 */
export function useTeamAlertsPreference(): {
  teamAlertsEnabled: boolean;
  setTeamAlertsEnabled: (enabled: boolean) => void;
} {
  const [teamAlertsEnabled, setEnabled] = useState(() => getIncomingAlertScope().teamAlerts);

  useEffect(() => {
    setEnabled(getIncomingAlertScope().teamAlerts);
  }, []);

  const update = useCallback((enabled: boolean) => {
    setTeamAlertsEnabled(enabled);
    setEnabled(enabled);
  }, []);

  return { teamAlertsEnabled, setTeamAlertsEnabled: update };
}

export function resetIncomingAlertScope(): void {
  scope = { myProfileId: null, teamAlerts: false };
}

/**
 * Publica a identidade de quem está logado — `profile.id`, que é o valor de
 * `contacts.assigned_to` (nunca o auth user id).
 *
 * Quem TEM o dado publica: o shell recebe `profile` como prop e é renderizado
 * também em testes de contrato SEM AuthProvider — pedir o contexto aqui
 * derrubaria a tela inteira por causa do aviso.
 *
 * Sem ninguém publicado, `shouldAlertIncomingMessage` NÃO filtra (falha
 * aberta): avisar a mais é melhor que emudecer o aviso do app inteiro.
 */
export function usePublishIncomingAlertIdentity(profileId: string | null | undefined): void {
  const id = profileId ?? null;
  useEffect(() => {
    setAlertProfileId(id);
    return () => setAlertProfileId(null);
  }, [id]);
}

/**
 * Devo ser avisado por esta mensagem?
 *
 * - conversa sem responsável: sim (está na fila geral, à espera de qualquer um);
 * - conversa minha (`assigned_to` = meu profiles.id): sim;
 * - conversa de outro atendente: NÃO — a menos que o supervisor tenha ligado
 *   "avisar também da equipe" (desligada por padrão);
 * - identidade ainda não carregada: sim (falha aberta, nunca emudece o app).
 */
export function shouldAlertIncomingMessage(
  contact: AlertableContact | null | undefined,
  currentScope: IncomingAlertScope = getIncomingAlertScope(),
): boolean {
  if (!contact) return false;
  if (!currentScope.myProfileId) return true;

  const owner = contact.assigned_to ?? null;
  if (!owner) return true;
  if (owner === currentScope.myProfileId) return true;
  return currentScope.teamAlerts;
}

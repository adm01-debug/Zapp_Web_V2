/**
 * Ponto ÚNICO da decisão "esta mensagem nova deve me avisar?".
 *
 * O caminho do inbox (`useRealtimeMessages` -> `notifyAboutIncomingMessage`) e o
 * aviso global (`useGlobalIncomingMessageAlerts`, montado no provedor de layout)
 * chamam a MESMA função: se a regra morasse em cada canal, ela valeria num só.
 *
 * A identidade (profiles.id — o valor de `contacts.assigned_to`, nunca o auth
 * user id) é PUBLICADA por quem tem o dado (`profile.id`, que o shell já recebe)
 * e lida aqui do módulo. O `useRealtimeNotifications` é usado por telas e testes
 * que não têm o AuthProvider em volta: pedir o contexto ali seria um contrato
 * novo e quebraria consumidores que hoje só precisam de notificação.
 */
import { useEffect } from 'react';

/**
 * Opção "avisar também das conversas da EQUIPE" (supervisor): NÃO existe aqui.
 * A preferência precisa ser alcançável por quem é supervisor — persistir onde
 * as outras preferências de notificação persistem (coluna em `user_settings`,
 * trilha de banco) e ter o interruptor no painel de notificações (área de
 * telas). Publicar um `setTeamAlertsEnabled` sem chamador seria código morto:
 * em vez disso, a regra abaixo fica com o padrão NEGADO e o cartão da UI assume
 * a opção.
 */

export interface IncomingAlertScope {
  myProfileId: string | null;
}

export interface AlertableContact {
  assigned_to?: string | null;
}

let scope: IncomingAlertScope = { myProfileId: null };

/** Publica a identidade de quem está logado (o dono das conversas que avisam). */
export function setAlertProfileId(profileId: string | null): void {
  if (scope.myProfileId === profileId) return;
  scope = { myProfileId: profileId };
}

export function getIncomingAlertScope(): IncomingAlertScope {
  return scope;
}

export function resetIncomingAlertScope(): void {
  scope = { myProfileId: null };
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
 * - conversa de outro atendente: NÃO (é o padrão negado do cartão);
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
  return owner === currentScope.myProfileId;
}

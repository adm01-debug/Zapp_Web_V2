import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type TabRole } from '@/lib/calls/tabLeaderStore';

/**
 * T20: papel da aba na eleição da sessão de chamadas (extraído do
 * `useSipClient` no T09 para manter o arquivo < 120 linhas, sem mudar
 * comportamento).
 *
 * Quem decide o papel é o store (`tabLeaderStore`), NÃO este hook — aqui só se
 * reage à eleição. `useSyncExternalStore` entrega o papel atual e re-renderiza
 * quando ele muda (o snapshot do store é estável quando nada muda, requisito do
 * hook do React).
 *
 * Os callbacks são guardados numa ref atualizada a cada commit (efeito), então o
 * efeito de transição depende SÓ de `tabRole`. Escolha deliberada: se dependesse
 * das identidades (`useCallback` com deps instáveis), um callback recriado a cada
 * render do chamador reagendaria o efeito e o ramo de seguidora reconectaria num
 * loop de `disconnect`. Com a ref, a identidade do callback nunca dispara o
 * efeito — só a TRANSIÇÃO de papel dispara.
 */
export function useTabLeaderRole(deps: {
  onBecameLeader: () => void;
  onBecameFollower: () => void;
}): TabRole {
  const callbacksRef = useRef(deps);
  // A ref é atualizada DENTRO de um efeito, nunca no corpo do render: escrever
  // em ref durante o render é erro de lint (`react-hooks/refs`) e o React não
  // garante que o valor valha para o que já foi renderizado. Declarado ANTES do
  // efeito de transição, ele roda primeiro na mesma passada.
  useEffect(() => { callbacksRef.current = deps; });

  const tabRole = useSyncExternalStore(subscribe, getSnapshot).role;
  const tabRoleAnteriorRef = useRef<TabRole | null>(null);
  useEffect(() => {
    const anterior = tabRoleAnteriorRef.current;
    tabRoleAnteriorRef.current = tabRole;
    // Só a TRANSIÇÃO age: o papel com que a aba NASCE não dispara conexão —
    // senão a aba que acabou de perder a eleição já teria aberto um REGISTER.
    if (anterior === null || anterior === tabRole) return;
    if (tabRole === 'leader') {
      // Virou líder (a aba que segurava a linha saiu): assume com as
      // credenciais provisionadas — o mesmo caminho de sempre.
      callbacksRef.current.onBecameLeader();
      return;
    }
    // Virou seguidora: solta o registro e explica por que a linha saiu daqui.
    callbacksRef.current.onBecameFollower();
  }, [tabRole]);

  return tabRole;
}

import {
  IlustracaoInbox,
  IlustracaoContacts,
  IlustracaoDashboard,
  IlustracaoCalls,
  IlustracaoNotifications,
  IlustracaoQueues,
  IlustracaoMessages,
  IlustracaoData,
  IlustracaoSearch,
  IlustracaoTranscriptions,
  IlustracaoAgents,
  IlustracaoWallet,
  IlustracaoGeneric,
} from './empty-state-illustration-art';

/**
 * Mapa das artes de estado vazio por contexto (`empty-state.tsx` e
 * `empty-states.tsx` consomem por chave).
 *
 * As artes vivem em `empty-state-illustration-art.tsx` — só componentes — por
 * causa da regra da casa `react-refresh/only-export-components`: um módulo que
 * exporta este mapa não pode declarar componentes. Cada arte checa
 * `useReducedMotion` e, com movimento reduzido, fica estática (sem loop).
 */
export const illustrations: Record<string, React.ReactNode> = {
  inbox: <IlustracaoInbox />,
  contacts: <IlustracaoContacts />,
  dashboard: <IlustracaoDashboard />,
  calls: <IlustracaoCalls />,
  notifications: <IlustracaoNotifications />,
  queues: <IlustracaoQueues />,
  messages: <IlustracaoMessages />,
  data: <IlustracaoData />,
  search: <IlustracaoSearch />,
  transcriptions: <IlustracaoTranscriptions />,
  agents: <IlustracaoAgents />,
  wallet: <IlustracaoWallet />,
  generic: <IlustracaoGeneric />,
};

import { describe, it, expect } from 'vitest';

// ─── RLS logic mirror for contacts (conversations) & messages ───
// Mirrors the database policies so regressions in the access model surface
// here before they reach production. Keep aligned with migrations on:
//   - public.contacts  (assigned_to scoping + admin/supervisor override)
//   - public.messages  (visibility via contact ownership)

type AppRole = 'admin' | 'supervisor' | 'agent' | 'special_agent';

interface User {
  id: string;
  role: AppRole;
  authenticated: boolean;
}

interface Contact {
  id: string;
  assigned_to: string | null;
}

interface Message {
  id: string;
  contact_id: string;
  sender: 'agent' | 'contact';
  agent_id?: string | null;
}

type RlsCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
type RlsPolicyCommand = RlsCommand | 'ALL';

interface MessagePolicy {
  name: string;
  command: RlsPolicyCommand;
  using?: string;
  check?: string;
}

const isAdminOrSupervisor = (role: AppRole) =>
  role === 'admin' || role === 'supervisor';

// public.contacts SELECT: assigned_to = profile(user) OR admin/supervisor OR unassigned
function canSelectContact(user: User, contact: Contact): boolean {
  if (!user.authenticated) return false;
  if (isAdminOrSupervisor(user.role)) return true;
  if (contact.assigned_to === null) return true; // queue pool
  return contact.assigned_to === user.id;
}

// public.contacts UPDATE: same as select but unassigned pool is writeable too
function canUpdateContact(user: User, contact: Contact): boolean {
  return canSelectContact(user, contact);
}

// public.messages SELECT: piggybacks on contact visibility
function canSelectMessage(user: User, contact: Contact | undefined): boolean {
  if (!user.authenticated || !contact) return false;
  return canSelectContact(user, contact);
}

// public.messages INSERT: must own the contact AND sender=agent must match self
function canInsertMessage(user: User, contact: Contact | undefined, msg: Message): boolean {
  if (!canSelectMessage(user, contact)) return false;
  if (msg.sender === 'agent' && msg.agent_id && msg.agent_id !== user.id) {
    return isAdminOrSupervisor(user.role);
  }
  return true;
}

const VISIBILIDADE_MESSAGES = [
  'contact.assigned_to = auth.uid()',
  'contact.assigned_to IS NULL',
  'is_admin_or_supervisor(auth.uid())',
];
const PREDICADO_VISIBILIDADE_MESSAGES = VISIBILIDADE_MESSAGES.join(' OR ');

function normSql(sql: string): string {
  return sql
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ramosDeOr(predicado: string): string[] {
  return predicado
    .split(/\s+OR\s+/i)
    .map(normSql)
    .filter(Boolean)
    .sort();
}

function cobreComando(policy: MessagePolicy, command: RlsCommand): boolean {
  return policy.command === 'ALL' || policy.command === command;
}

function predicadoEfetivo(policy: MessagePolicy, command: RlsCommand): string {
  if (command === 'INSERT') return policy.check ?? policy.using ?? 'true';
  return policy.using ?? 'true';
}

function predicadoEquivaleAoContratoMessages(predicado: string): boolean {
  return JSON.stringify(ramosDeOr(predicado)) === JSON.stringify(ramosDeOr(PREDICADO_VISIBILIDADE_MESSAGES));
}

function deleteSemContratoMessages(policies: MessagePolicy[]): string[] {
  return policies
    .filter((policy) => cobreComando(policy, 'DELETE'))
    .filter((policy) => !predicadoEquivaleAoContratoMessages(predicadoEfetivo(policy, 'DELETE')))
    .map((policy) => policy.name);
}

const admin: User = { id: 'u-admin', role: 'admin', authenticated: true };
const supervisor: User = { id: 'u-sup', role: 'supervisor', authenticated: true };
const agentA: User = { id: 'u-agent-a', role: 'agent', authenticated: true };
const agentB: User = { id: 'u-agent-b', role: 'agent', authenticated: true };
const anon: User = { id: '', role: 'agent', authenticated: false };

const contactOfA: Contact = { id: 'c-1', assigned_to: agentA.id };
const contactOfB: Contact = { id: 'c-2', assigned_to: agentB.id };
const unassigned: Contact = { id: 'c-3', assigned_to: null };

describe('RLS: contacts (conversations) — read access', () => {
  it('agent reads conversations assigned to them', () => {
    expect(canSelectContact(agentA, contactOfA)).toBe(true);
  });

  it('agent CANNOT read conversations assigned to another agent', () => {
    expect(canSelectContact(agentA, contactOfB)).toBe(false);
    expect(canSelectContact(agentB, contactOfA)).toBe(false);
  });

  it('agent can read unassigned (queue pool) conversations', () => {
    expect(canSelectContact(agentA, unassigned)).toBe(true);
  });

  it('admin and supervisor read every conversation', () => {
    for (const c of [contactOfA, contactOfB, unassigned]) {
      expect(canSelectContact(admin, c)).toBe(true);
      expect(canSelectContact(supervisor, c)).toBe(true);
    }
  });

  it('unauthenticated users read nothing', () => {
    for (const c of [contactOfA, contactOfB, unassigned]) {
      expect(canSelectContact(anon, c)).toBe(false);
    }
  });
});

describe('RLS: contacts (conversations) — write access', () => {
  it('agent updates own conversation', () => {
    expect(canUpdateContact(agentA, contactOfA)).toBe(true);
  });

  it('agent CANNOT update conversation owned by another agent', () => {
    expect(canUpdateContact(agentA, contactOfB)).toBe(false);
  });

  it('admin/supervisor update any conversation', () => {
    expect(canUpdateContact(admin, contactOfB)).toBe(true);
    expect(canUpdateContact(supervisor, contactOfA)).toBe(true);
  });
});

describe('RLS: messages — read access via contact ownership', () => {
  const msgOnA: Message = { id: 'm-1', contact_id: contactOfA.id, sender: 'contact' };
  const msgOnB: Message = { id: 'm-2', contact_id: contactOfB.id, sender: 'contact' };

  it('agent reads messages of their conversations', () => {
    expect(canSelectMessage(agentA, contactOfA)).toBe(true);
  });

  it('agent CANNOT read messages from other agents conversations', () => {
    expect(canSelectMessage(agentA, contactOfB)).toBe(false);
    expect(canSelectMessage(agentB, contactOfA)).toBe(false);
  });

  it('admin/supervisor read every message', () => {
    expect(canSelectMessage(admin, contactOfB)).toBe(true);
    expect(canSelectMessage(supervisor, contactOfA)).toBe(true);
  });

  it('orphan messages (no contact loaded) are denied', () => {
    expect(canSelectMessage(agentA, undefined)).toBe(false);
  });

  it('unauthenticated reads nothing', () => {
    expect(canSelectMessage(anon, contactOfA)).toBe(false);
    expect(canSelectMessage(anon, unassigned)).toBe(false);
    void msgOnA; void msgOnB;
  });
});

describe('RLS: messages — DELETE policy contract', () => {
  it('aceita ausencia total de policy que cubra DELETE', () => {
    const policies: MessagePolicy[] = [
      { name: 'messages_select', command: 'SELECT', using: PREDICADO_VISIBILIDADE_MESSAGES },
      { name: 'messages_insert', command: 'INSERT', check: PREDICADO_VISIBILIDADE_MESSAGES },
    ];

    expect(policies.some((policy) => cobreComando(policy, 'DELETE'))).toBe(false);
    expect(deleteSemContratoMessages(policies)).toEqual([]);
  });

  it('FOR DELETE precisa reproduzir o predicado completo de visibilidade', () => {
    const policies: MessagePolicy[] = [
      { name: 'messages_delete', command: 'DELETE', using: PREDICADO_VISIBILIDADE_MESSAGES },
      { name: 'messages_delete_sem_fila', command: 'DELETE', using: VISIBILIDADE_MESSAGES.slice(0, 2).join(' OR ') },
    ];

    expect(policies.every((policy) => cobreComando(policy, 'DELETE'))).toBe(true);
    expect(deleteSemContratoMessages(policies)).toEqual(['messages_delete_sem_fila']);
  });

  it('FOR ALL cobre DELETE e nao contorna a exigencia do contrato', () => {
    const policies: MessagePolicy[] = [
      { name: 'messages_all_irrestrito', command: 'ALL', using: 'true', check: PREDICADO_VISIBILIDADE_MESSAGES },
      { name: 'messages_all_contratado', command: 'ALL', using: PREDICADO_VISIBILIDADE_MESSAGES },
    ];

    expect(policies.map((policy) => cobreComando(policy, 'DELETE'))).toEqual([true, true]);
    expect(predicadoEfetivo(policies[0], 'DELETE')).toBe('true');
    expect(deleteSemContratoMessages(policies)).toEqual(['messages_all_irrestrito']);
  });

  it('recusa FOR ALL com true OR predicado contratado mesmo contendo todos os trechos esperados', () => {
    const policy: MessagePolicy = {
      name: 'messages_all_true_or_contrato',
      command: 'ALL',
      using: `true OR ${PREDICADO_VISIBILIDADE_MESSAGES}`,
    };
    const predicado = predicadoEfetivo(policy, 'DELETE');

    for (const trechoEsperado of VISIBILIDADE_MESSAGES) {
      expect(predicado).toContain(trechoEsperado);
    }
    expect(cobreComando(policy, 'DELETE')).toBe(true);
    expect(deleteSemContratoMessages([policy])).toEqual(['messages_all_true_or_contrato']);
  });
});

describe('RLS: messages — write access', () => {
  it('agent sends message in their own conversation as themselves', () => {
    const msg: Message = { id: 'new', contact_id: contactOfA.id, sender: 'agent', agent_id: agentA.id };
    expect(canInsertMessage(agentA, contactOfA, msg)).toBe(true);
  });

  it('agent CANNOT impersonate another agent', () => {
    const msg: Message = { id: 'new', contact_id: contactOfA.id, sender: 'agent', agent_id: agentB.id };
    expect(canInsertMessage(agentA, contactOfA, msg)).toBe(false);
  });

  it('agent CANNOT write into another agent conversation', () => {
    const msg: Message = { id: 'new', contact_id: contactOfB.id, sender: 'agent', agent_id: agentA.id };
    expect(canInsertMessage(agentA, contactOfB, msg)).toBe(false);
  });

  it('admin/supervisor can write on behalf of any agent', () => {
    const msg: Message = { id: 'new', contact_id: contactOfB.id, sender: 'agent', agent_id: agentA.id };
    expect(canInsertMessage(admin, contactOfB, msg)).toBe(true);
    expect(canInsertMessage(supervisor, contactOfB, msg)).toBe(true);
  });

  it('unauthenticated writes nothing', () => {
    const msg: Message = { id: 'new', contact_id: contactOfA.id, sender: 'agent', agent_id: anon.id };
    expect(canInsertMessage(anon, contactOfA, msg)).toBe(false);
  });
});

describe('RLS: cross-agent isolation matrix', () => {
  const agents = [agentA, agentB];
  const contacts = [contactOfA, contactOfB];

  for (const user of agents) {
    for (const c of contacts) {
      const owned = c.assigned_to === user.id;
      it(`${user.id} ${owned ? 'CAN' : 'CANNOT'} access ${c.id}`, () => {
        expect(canSelectContact(user, c)).toBe(owned);
        expect(canUpdateContact(user, c)).toBe(owned);
        expect(canSelectMessage(user, c)).toBe(owned);
      });
    }
  }
});

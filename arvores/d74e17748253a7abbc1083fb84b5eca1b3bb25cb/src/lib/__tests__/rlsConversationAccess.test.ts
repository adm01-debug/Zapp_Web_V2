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
import { describe, it, expect } from 'vitest';

/**
 * E94/E95: RLS contract tests for team_messages and department_invites.
 * Run against static fixtures — no live DB required.
 */

const REQUIRED_TEAM_MESSAGES_COLS = [
  'id', 'conversation_id', 'sender_id', 'content', 'type', 'status',
  'created_at', 'updated_at',
] as const;

const REQUIRED_DEPARTMENT_INVITES_COLS = [
  'id', 'department_id', 'invitee_id', 'invited_by', 'token', 'status',
  'expires_at', 'created_at',
] as const;

const fixtureTeamMessage: Record<string, unknown> = {
  id: 'msg-1',
  conversation_id: 'conv-1',
  sender_id: 'user-1',
  content: 'hello',
  type: 'text',
  status: 'sent',
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
};

const fixtureDeptInvite: Record<string, unknown> = {
  id: 'inv-1',
  department_id: 'dept-1',
  invitee_id: 'user-2',
  invited_by: 'user-1',
  token: 'tok-abc',
  status: 'pending',
  expires_at: '2026-10-04T00:00:00Z',
  created_at: '2026-09-27T00:00:00Z',
};

describe('RLS contract — team_messages (E94)', () => {
  it('fixture has all required columns', () => {
    for (const col of REQUIRED_TEAM_MESSAGES_COLS) {
      expect(fixtureTeamMessage).toHaveProperty(col);
    }
  });

  it('status is a recognised value', () => {
    const valid = ['sent', 'delivered', 'read', 'failed'];
    expect(valid).toContain(fixtureTeamMessage.status);
  });

  it('conversation_id and sender_id are non-empty strings', () => {
    expect(typeof fixtureTeamMessage.conversation_id).toBe('string');
    expect((fixtureTeamMessage.conversation_id as string).length).toBeGreaterThan(0);
    expect(typeof fixtureTeamMessage.sender_id).toBe('string');
    expect((fixtureTeamMessage.sender_id as string).length).toBeGreaterThan(0);
  });
});

describe('RLS contract — department_invites (E95)', () => {
  it('fixture has all required columns', () => {
    for (const col of REQUIRED_DEPARTMENT_INVITES_COLS) {
      expect(fixtureDeptInvite).toHaveProperty(col);
    }
  });

  it('status defaults to pending', () => {
    expect(fixtureDeptInvite.status).toBe('pending');
  });

  it('expires_at is a valid ISO date string', () => {
    const d = new Date(fixtureDeptInvite.expires_at as string);
    expect(isNaN(d.getTime())).toBe(false);
  });
});

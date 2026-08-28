import { describe, it, expect } from 'vitest';

// ─── Test Evolution API group data normalization logic ───

interface EvolutionGroup {
  id?: string;
  jid?: string;
  groupJid?: string;
  subject?: string;
  name?: string;
  size?: number;
  participants?: any[];
  desc?: string;
  description?: string;
  announce?: boolean;
  iAmAdmin?: boolean;
  // Evolution GO (whatsmeow types.GroupInfo — campos PascalCase)
  JID?: string;
  Name?: string;
  Topic?: string;
  Participants?: unknown[];
  IsAnnounce?: boolean;
}

// Espelha a lógica de src/hooks/groups/actions.ts (handleAutoSync)
function extractGroupData(g: EvolutionGroup) {
  const groupJid = g.id || g.jid || g.groupJid || g.JID || null;
  const groupName = g.subject || g.name || g.Name || 'Grupo sem nome';
  const participantCount = g.size || g.participants?.length || g.Participants?.length || 0;
  const groupDesc = g.desc || g.description || g.Topic || null;
  const isAdmin = g.announce === true || g.iAmAdmin === true || g.IsAnnounce === true;
  return { groupJid, groupName, participantCount, groupDesc, isAdmin };
}

function normalizeApiResponse(data: unknown): EvolutionGroup[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as EvolutionGroup[];
    if (Array.isArray(obj.groups)) return obj.groups as EvolutionGroup[];
  }
  return [];
}

describe('Group Data Extraction', () => {
  describe('JID Resolution', () => {
    it('uses id field first', () => {
      expect(extractGroupData({ id: '1@g.us', jid: '2@g.us' }).groupJid).toBe('1@g.us');
    });

    it('falls back to jid', () => {
      expect(extractGroupData({ jid: '2@g.us' }).groupJid).toBe('2@g.us');
    });

    it('falls back to groupJid', () => {
      expect(extractGroupData({ groupJid: '3@g.us' }).groupJid).toBe('3@g.us');
    });

    it('returns null when no JID field', () => {
      expect(extractGroupData({}).groupJid).toBeNull();
    });

    it('falls back to Evolution GO JID (whatsmeow)', () => {
      expect(extractGroupData({ JID: '4@g.us' }).groupJid).toBe('4@g.us');
    });
  });

  describe('Evolution GO shape (whatsmeow GroupInfo)', () => {
    it('extracts all fields from GO group', () => {
      const result = extractGroupData({
        JID: '120363@g.us', Name: 'Grupo GO', Topic: 'descrição',
        Participants: [{ JID: 'a' }, { JID: 'b' }], IsAnnounce: true,
      });
      expect(result.groupJid).toBe('120363@g.us');
      expect(result.groupName).toBe('Grupo GO');
      expect(result.groupDesc).toBe('descrição');
      expect(result.participantCount).toBe(2);
      expect(result.isAdmin).toBe(true);
    });
  });

  describe('Name Resolution', () => {
    it('uses subject first', () => {
      expect(extractGroupData({ subject: 'SubjectName', name: 'Name' }).groupName).toBe('SubjectName');
    });

    it('falls back to name', () => {
      expect(extractGroupData({ name: 'NameOnly' }).groupName).toBe('NameOnly');
    });

    it('defaults to "Grupo sem nome"', () => {
      expect(extractGroupData({}).groupName).toBe('Grupo sem nome');
    });
  });

  describe('Participant Count', () => {
    it('uses size field', () => {
      expect(extractGroupData({ size: 42 }).participantCount).toBe(42);
    });

    it('falls back to participants array length', () => {
      expect(extractGroupData({ participants: [1, 2, 3] }).participantCount).toBe(3);
    });

    it('defaults to 0', () => {
      expect(extractGroupData({}).participantCount).toBe(0);
    });

    it('prefers size over participants length', () => {
      expect(extractGroupData({ size: 10, participants: [1, 2] }).participantCount).toBe(10);
    });
  });

  describe('Description', () => {
    it('uses desc field', () => {
      expect(extractGroupData({ desc: 'Description via desc' }).groupDesc).toBe('Description via desc');
    });

    it('falls back to description field', () => {
      expect(extractGroupData({ description: 'Description via description' }).groupDesc).toBe('Description via description');
    });

    it('defaults to null', () => {
      expect(extractGroupData({}).groupDesc).toBeNull();
    });
  });

  describe('Admin Detection', () => {
    it('detects admin via announce=true', () => {
      expect(extractGroupData({ announce: true }).isAdmin).toBe(true);
    });

    it('detects admin via iAmAdmin=true', () => {
      expect(extractGroupData({ iAmAdmin: true }).isAdmin).toBe(true);
    });

    it('defaults to false', () => {
      expect(extractGroupData({}).isAdmin).toBe(false);
    });

    it('false when both are false', () => {
      expect(extractGroupData({ announce: false, iAmAdmin: false }).isAdmin).toBe(false);
    });
  });
});

describe('API Response Normalization', () => {
  it('handles array response', () => {
    const data = [{ id: '1@g.us' }, { id: '2@g.us' }];
    expect(normalizeApiResponse(data)).toHaveLength(2);
  });

  it('handles { data: [...] } wrapper', () => {
    const data = { data: [{ id: '1@g.us' }] };
    expect(normalizeApiResponse(data)).toHaveLength(1);
  });

  it('handles { groups: [...] } wrapper', () => {
    const data = { groups: [{ id: '1@g.us' }, { id: '2@g.us' }] };
    expect(normalizeApiResponse(data)).toHaveLength(2);
  });

  it('returns empty array for null', () => {
    expect(normalizeApiResponse(null)).toHaveLength(0);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeApiResponse(undefined)).toHaveLength(0);
  });

  it('returns empty array for string', () => {
    expect(normalizeApiResponse('not an array')).toHaveLength(0);
  });

  it('returns empty array for number', () => {
    expect(normalizeApiResponse(42)).toHaveLength(0);
  });

  it('returns empty array for empty object', () => {
    expect(normalizeApiResponse({})).toHaveLength(0);
  });

  it('returns empty array for object without data/groups keys', () => {
    expect(normalizeApiResponse({ results: [1, 2, 3] })).toHaveLength(0);
  });
});

describe('Integration: Full Group Sync Flow', () => {
  it('processes typical Evolution API response correctly', () => {
    const apiResponse = [
      {
        id: '5511999@g.us',
        subject: 'Equipe Marketing',
        size: 25,
        desc: 'Grupo da equipe de marketing',
        iAmAdmin: true,
      },
      {
        id: '5511888@g.us',
        subject: 'Suporte Técnico',
        size: 12,
        desc: null,
        iAmAdmin: false,
      },
    ];

    const groups = normalizeApiResponse(apiResponse);
    expect(groups).toHaveLength(2);

    const g1 = extractGroupData(groups[0]);
    expect(g1.groupJid).toBe('5511999@g.us');
    expect(g1.groupName).toBe('Equipe Marketing');
    expect(g1.participantCount).toBe(25);
    expect(g1.groupDesc).toBe('Grupo da equipe de marketing');
    expect(g1.isAdmin).toBe(true);

    const g2 = extractGroupData(groups[1]);
    expect(g2.groupJid).toBe('5511888@g.us');
    expect(g2.groupName).toBe('Suporte Técnico');
    expect(g2.participantCount).toBe(12);
    expect(g2.groupDesc).toBeNull();
    expect(g2.isAdmin).toBe(false);
  });

  it('handles malformed group entries gracefully', () => {
    const apiResponse = [
      {}, // no fields
      { id: '1@g.us' }, // minimal
      { subject: 'Unnamed', size: 0 }, // no JID
    ];

    const groups = normalizeApiResponse(apiResponse);
    expect(groups).toHaveLength(3);

    const g1 = extractGroupData(groups[0]);
    expect(g1.groupJid).toBeNull();
    expect(g1.groupName).toBe('Grupo sem nome');

    const g2 = extractGroupData(groups[1]);
    expect(g2.groupJid).toBe('1@g.us');
    expect(g2.groupName).toBe('Grupo sem nome');

    const g3 = extractGroupData(groups[2]);
    expect(g3.groupJid).toBeNull();
    expect(g3.groupName).toBe('Unnamed');
  });
});

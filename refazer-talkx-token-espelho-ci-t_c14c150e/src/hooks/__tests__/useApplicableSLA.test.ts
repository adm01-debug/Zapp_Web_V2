import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Types ──
interface SLARule {
  id: string;
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: number;
  contact_id: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  queue_id: string | null;
  agent_id: string | null;
  is_active: boolean;
}

interface SLAConfig {
  id: string;
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  is_active: boolean;
  is_default: boolean;
}

interface ContactSLAParams {
  contactId?: string;
  company?: string | null;
  jobTitle?: string | null;
  contactType?: string | null;
  queueId?: string | null;
  agentId?: string | null;
}

interface ApplicableSLA {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  ruleName: string;
  ruleId: string | null;
}

// ── Pure resolution function extracted from hook logic ──
function resolveApplicableSLA(
  rules: SLARule[],
  configs: SLAConfig[],
  params: ContactSLAParams
): ApplicableSLA {
  // Hierarchy: contact > company > job_title > contact_type > queue > agent > global
  for (const rule of rules) {
    if (rule.contact_id && rule.contact_id === params.contactId) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }
  for (const rule of rules) {
    if (rule.company && rule.company === params.company && !rule.contact_id) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }
  for (const rule of rules) {
    if (rule.job_title && rule.job_title === params.jobTitle && !rule.contact_id && !rule.company) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }
  for (const rule of rules) {
    if (rule.contact_type && rule.contact_type === params.contactType && !rule.contact_id && !rule.company && !rule.job_title) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }
  for (const rule of rules) {
    if (rule.queue_id && rule.queue_id === params.queueId && !rule.contact_id) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }
  for (const rule of rules) {
    if (rule.agent_id && rule.agent_id === params.agentId && !rule.contact_id) {
      return { firstResponseMinutes: rule.first_response_minutes, resolutionMinutes: rule.resolution_minutes, ruleName: rule.name, ruleId: rule.id };
    }
  }

  // Global fallback
  const defaultConfig = configs.find(c => c.is_active && c.is_default);
  if (defaultConfig) {
    return {
      firstResponseMinutes: defaultConfig.first_response_minutes,
      resolutionMinutes: defaultConfig.resolution_minutes,
      ruleName: defaultConfig.name,
      ruleId: null,
    };
  }

  return { firstResponseMinutes: 5, resolutionMinutes: 60, ruleName: 'Padrão do Sistema', ruleId: null };
}

// ── Test Data Factories ──
const makeRule = (overrides: Partial<SLARule> = {}): SLARule => ({
  id: crypto.randomUUID(),
  name: 'Test Rule',
  first_response_minutes: 10,
  resolution_minutes: 120,
  priority: 10,
  contact_id: null,
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  is_active: true,
  ...overrides,
});

const makeConfig = (overrides: Partial<SLAConfig> = {}): SLAConfig => ({
  id: crypto.randomUUID(),
  name: 'Global Default',
  first_response_minutes: 15,
  resolution_minutes: 240,
  is_active: true,
  is_default: true,
  ...overrides,
});

// ── Tests ──
describe('SLA Resolution Hierarchy', () => {
  const contactId = 'contact-uuid-001';
  const company = 'Acme Corp';
  const jobTitle = 'Diretor';
  const contactType = 'vip';
  const queueId = 'queue-uuid-001';
  const agentId = 'agent-uuid-001';

  it('returns system default when no rules or configs exist', () => {
    const result = resolveApplicableSLA([], [], { contactId });
    expect(result).toEqual({
      firstResponseMinutes: 5,
      resolutionMinutes: 60,
      ruleName: 'Padrão do Sistema',
      ruleId: null,
    });
  });

  it('returns global config fallback when no granular rules match', () => {
    const config = makeConfig({ first_response_minutes: 20, resolution_minutes: 300 });
    const result = resolveApplicableSLA([], [config], { contactId: 'no-match' });
    expect(result.firstResponseMinutes).toBe(20);
    expect(result.resolutionMinutes).toBe(300);
    expect(result.ruleId).toBeNull();
  });

  it('prioritizes contact-level rule over company-level', () => {
    const contactRule = makeRule({ contact_id: contactId, company: null, first_response_minutes: 2, name: 'VIP Contact' });
    const companyRule = makeRule({ contact_id: null, company, first_response_minutes: 8, name: 'Company Rule' });
    const result = resolveApplicableSLA([contactRule, companyRule], [], { contactId, company });
    expect(result.ruleName).toBe('VIP Contact');
    expect(result.firstResponseMinutes).toBe(2);
  });

  it('prioritizes company-level rule over job_title-level', () => {
    const companyRule = makeRule({ company, first_response_minutes: 5, name: 'Company' });
    const jobRule = makeRule({ job_title: jobTitle, first_response_minutes: 15, name: 'Job' });
    const result = resolveApplicableSLA([companyRule, jobRule], [], { company, jobTitle });
    expect(result.ruleName).toBe('Company');
  });

  it('prioritizes job_title over contact_type', () => {
    const jobRule = makeRule({ job_title: jobTitle, first_response_minutes: 7, name: 'Director SLA' });
    const typeRule = makeRule({ contact_type: contactType, first_response_minutes: 12, name: 'VIP SLA' });
    const result = resolveApplicableSLA([jobRule, typeRule], [], { jobTitle, contactType });
    expect(result.ruleName).toBe('Director SLA');
  });

  it('prioritizes contact_type over queue', () => {
    const typeRule = makeRule({ contact_type: contactType, first_response_minutes: 3, name: 'Type' });
    const queueRule = makeRule({ queue_id: queueId, first_response_minutes: 10, name: 'Queue' });
    const result = resolveApplicableSLA([typeRule, queueRule], [], { contactType, queueId });
    expect(result.ruleName).toBe('Type');
  });

  it('prioritizes queue over agent', () => {
    const queueRule = makeRule({ queue_id: queueId, first_response_minutes: 6, name: 'Queue' });
    const agentRule = makeRule({ agent_id: agentId, first_response_minutes: 20, name: 'Agent' });
    const result = resolveApplicableSLA([queueRule, agentRule], [], { queueId, agentId });
    expect(result.ruleName).toBe('Queue');
  });

  it('falls back to agent rule when no higher-priority scope matches', () => {
    const agentRule = makeRule({ agent_id: agentId, first_response_minutes: 25, name: 'Agent Custom' });
    const result = resolveApplicableSLA([agentRule], [], { agentId, contactId: 'no-match' });
    expect(result.ruleName).toBe('Agent Custom');
    expect(result.firstResponseMinutes).toBe(25);
  });

  it('falls back to global config when granular rules exist but none match', () => {
    const unrelatedRule = makeRule({ contact_id: 'other-contact', name: 'Other' });
    const config = makeConfig({ first_response_minutes: 30, name: 'Global' });
    const result = resolveApplicableSLA([unrelatedRule], [config], { contactId });
    expect(result.ruleName).toBe('Global');
    expect(result.firstResponseMinutes).toBe(30);
  });

  it('handles full hierarchy traversal with all levels populated', () => {
    const rules = [
      makeRule({ agent_id: agentId, first_response_minutes: 30, name: 'Agent', priority: 1 }),
      makeRule({ queue_id: queueId, first_response_minutes: 25, name: 'Queue', priority: 2 }),
      makeRule({ contact_type: contactType, first_response_minutes: 20, name: 'Type', priority: 3 }),
      makeRule({ job_title: jobTitle, first_response_minutes: 15, name: 'Job', priority: 4 }),
      makeRule({ company, first_response_minutes: 10, name: 'Company', priority: 5 }),
      makeRule({ contact_id: contactId, first_response_minutes: 3, name: 'Contact', priority: 6 }),
    ];
    const result = resolveApplicableSLA(rules, [], { contactId, company, jobTitle, contactType, queueId, agentId });
    expect(result.ruleName).toBe('Contact');
    expect(result.firstResponseMinutes).toBe(3);
  });

  it('skips inactive global configs', () => {
    const inactiveConfig = makeConfig({ is_active: false, name: 'Inactive' });
    const result = resolveApplicableSLA([], [inactiveConfig], { contactId });
    expect(result.ruleName).toBe('Padrão do Sistema');
  });

  it('skips non-default global configs', () => {
    const nonDefault = makeConfig({ is_default: false, name: 'Non-Default' });
    const result = resolveApplicableSLA([], [nonDefault], { contactId });
    expect(result.ruleName).toBe('Padrão do Sistema');
  });

  it('does not match company rule that also has contact_id set (mixed-scope)', () => {
    // A rule with both contact_id and company should only match at contact level
    const mixedRule = makeRule({ contact_id: 'other-id', company, first_response_minutes: 1, name: 'Mixed' });
    const result = resolveApplicableSLA([mixedRule], [], { company, contactId: 'no-match' });
    // Should NOT match company level because contact_id is set
    expect(result.ruleName).toBe('Padrão do Sistema');
  });

  it('returns resolution_minutes correctly alongside first_response_minutes', () => {
    const rule = makeRule({ contact_id: contactId, first_response_minutes: 3, resolution_minutes: 45, name: 'Quick' });
    const result = resolveApplicableSLA([rule], [], { contactId });
    expect(result.resolutionMinutes).toBe(45);
  });
});

describe('SLA Resolution — Edge Cases', () => {
  it('handles null/undefined params gracefully', () => {
    const rule = makeRule({ company: 'Test', name: 'Company Rule' });
    const result = resolveApplicableSLA([rule], [], { contactId: undefined, company: null });
    expect(result.ruleName).toBe('Padrão do Sistema');
  });

  it('handles empty string params (should not match)', () => {
    const rule = makeRule({ company: 'Test', name: 'Company Rule' });
    const result = resolveApplicableSLA([rule], [], { company: '' });
    expect(result.ruleName).toBe('Padrão do Sistema');
  });

  it('handles very large priority values', () => {
    const rule = makeRule({ contact_id: 'c1', priority: 999999, first_response_minutes: 1, name: 'Ultra' });
    const result = resolveApplicableSLA([rule], [], { contactId: 'c1' });
    expect(result.firstResponseMinutes).toBe(1);
  });

  it('handles multiple rules for same scope — first match wins (ordered by priority desc)', () => {
    const highPrio = makeRule({ company: 'Acme', priority: 100, first_response_minutes: 2, name: 'High' });
    const lowPrio = makeRule({ company: 'Acme', priority: 1, first_response_minutes: 30, name: 'Low' });
    // Rules should come pre-sorted by priority desc
    const result = resolveApplicableSLA([highPrio, lowPrio], [], { company: 'Acme' });
    expect(result.ruleName).toBe('High');
    expect(result.firstResponseMinutes).toBe(2);
  });

  it('handles boundary value: first_response_minutes = 1', () => {
    const rule = makeRule({ contact_id: 'c1', first_response_minutes: 1, resolution_minutes: 1, name: 'Min' });
    const result = resolveApplicableSLA([rule], [], { contactId: 'c1' });
    expect(result.firstResponseMinutes).toBe(1);
    expect(result.resolutionMinutes).toBe(1);
  });
});

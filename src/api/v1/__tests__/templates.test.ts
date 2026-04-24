// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { canViewScheduleTemplate, instantiateScheduleTemplate, type ScheduleTemplateV1 } from '../templates';

const template: ScheduleTemplateV1 = {
  id: 'sched-team-oncall',
  name: 'Team on-call',
  timezone: 'America/Chicago',
  entries: [
    { id: 'primary', title: 'Primary on-call', startOffsetMinutes: 0, durationMinutes: 480, rrule: 'FREQ=DAILY' },
    { id: 'backup', title: 'Backup on-call', startOffsetMinutes: 60, durationMinutes: 480, rrule: 'FREQ=DAILY' },
  ],
};

describe('instantiateScheduleTemplate', () => {
  it('creates event masters anchored to the requested datetime', () => {
    const result = instantiateScheduleTemplate(template, {
      anchor: new Date('2026-04-20T08:00:00.000Z'),
      resource: 'Ops Team',
      category: 'On-call',
      meta: { generatedBy: 'wizard' },
    });

    expect(result.templateId).toBe('sched-team-oncall');
    expect(result.generated).toHaveLength(2);
    expect(result.generated[0].title!).toBe('Primary on-call');
    expect(result.generated[0].resource!).toBe('Ops Team');
    expect(result.generated[0].category!).toBe('On-call');
    expect(result.generated[0].rrule!).toBe('FREQ=DAILY');
    expect(result.generated[0].start!).toEqual(new Date('2026-04-20T08:00:00.000Z'));
    expect(result.generated[1].start!).toEqual(new Date('2026-04-20T09:00:00.000Z'));
    expect(result.generated[0].meta!).toMatchObject({
      scheduleTemplateId: 'sched-team-oncall',
      scheduleTemplateEntryId: 'primary',
      generatedBy: 'wizard',
    });
  });

  it('throws on malformed anchor and malformed template entries', () => {
    expect(() => instantiateScheduleTemplate(template, { anchor: 'bad-anchor' })).toThrow(
      'Schedule anchor must be a valid date.',
    );

    const malformedTemplate: ScheduleTemplateV1 = {
      ...template,
      entries: [
        {
          title: '',
          startOffsetMinutes: Number.NaN,
          durationMinutes: Number.NaN,
        },
      ],
    };

    expect(() => instantiateScheduleTemplate(malformedTemplate, { anchor: new Date('2026-04-20T08:00:00.000Z') })).toThrow(
      'Schedule template entry 1 is missing a valid title.',
    );
  });
});

describe('canViewScheduleTemplate', () => {
  it('enforces private/team/org visibility', () => {
    expect(canViewScheduleTemplate({ ...template, visibility: 'org' }, { role: 'readonly' })).toBe(true);
    expect(canViewScheduleTemplate({ ...template, visibility: 'team' }, { role: 'user' })).toBe(true);
    expect(canViewScheduleTemplate({ ...template, visibility: 'team' }, { role: 'readonly' })).toBe(false);
    expect(canViewScheduleTemplate({ ...template, visibility: 'private' }, { role: 'user' })).toBe(false);
    expect(canViewScheduleTemplate({ ...template, visibility: 'private' }, { role: 'admin' })).toBe(true);
  });
});

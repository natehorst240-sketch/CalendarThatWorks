// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { instantiateScheduleTemplate, type ScheduleTemplateV1 } from '../templates.js';

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
    expect(result.generated[0].title).toBe('Primary on-call');
    expect(result.generated[0].resource).toBe('Ops Team');
    expect(result.generated[0].category).toBe('On-call');
    expect(result.generated[0].rrule).toBe('FREQ=DAILY');
    expect(result.generated[0].start).toEqual(new Date('2026-04-20T08:00:00.000Z'));
    expect(result.generated[1].start).toEqual(new Date('2026-04-20T09:00:00.000Z'));
    expect(result.generated[0].meta).toMatchObject({
      scheduleTemplateId: 'sched-team-oncall',
      scheduleTemplateEntryId: 'primary',
      generatedBy: 'wizard',
    });
  });
});

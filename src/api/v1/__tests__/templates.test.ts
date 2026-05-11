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

  it('accepts string anchor', () => {
    const result = instantiateScheduleTemplate(
      { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: 60 }] },
      { anchor: '2026-04-20T08:00:00.000Z' },
    );
    expect(result.generated[0].start).toBeInstanceOf(Date);
  });

  it('accepts numeric anchor (Unix timestamp)', () => {
    const ts = new Date('2026-04-20T08:00:00.000Z').getTime();
    const result = instantiateScheduleTemplate(
      { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: 60 }] },
      { anchor: ts },
    );
    expect(result.generated[0].start).toBeInstanceOf(Date);
  });

  it('clamps durationMinutes to 1 when 0 or negative', () => {
    const result = instantiateScheduleTemplate(
      { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: 0 }] },
      { anchor: new Date('2026-04-20T08:00:00.000Z') },
    );
    const diff = new Date(result.generated[0].end!).getTime() - new Date(result.generated[0].start!).getTime();
    expect(diff).toBe(60_000);
  });

  it('falls back to entry resource/category when request fields absent', () => {
    const result = instantiateScheduleTemplate(
      { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: 60, category: 'Cat', resource: 'Res' }] },
      { anchor: new Date('2026-04-20T08:00:00.000Z') },
    );
    expect(result.generated[0].category).toBe('Cat');
    expect(result.generated[0].resource).toBe('Res');
  });

  it('generates fallback entry id when entry has no id', () => {
    const result = instantiateScheduleTemplate(
      { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: 60 }] },
      { anchor: new Date('2026-04-20T08:00:00.000Z') },
    );
    expect((result.generated[0].meta as any).scheduleTemplateEntryId).toBe('sched-team-oncall:0');
  });

  it('throws when template has no entries', () => {
    expect(() =>
      instantiateScheduleTemplate({ ...template, entries: [] }, { anchor: new Date() })
    ).toThrow('at least one entry');
  });

  it('throws when entry has invalid startOffsetMinutes', () => {
    expect(() =>
      instantiateScheduleTemplate(
        { ...template, entries: [{ title: 'T', startOffsetMinutes: NaN, durationMinutes: 60 }] },
        { anchor: new Date() },
      )
    ).toThrow('invalid start offset');
  });

  it('throws when entry has invalid durationMinutes', () => {
    expect(() =>
      instantiateScheduleTemplate(
        { ...template, entries: [{ title: 'T', startOffsetMinutes: 0, durationMinutes: NaN }] },
        { anchor: new Date() },
      )
    ).toThrow('invalid duration');
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

  it('org visibility allows any viewer including empty context', () => {
    expect(canViewScheduleTemplate({ ...template, visibility: 'org' }, {})).toBe(true);
    expect(canViewScheduleTemplate({ ...template, visibility: 'org' })).toBe(true);
  });

  it('team visibility allows isOwner', () => {
    expect(canViewScheduleTemplate({ ...template, visibility: 'team' }, { isOwner: true })).toBe(true);
  });

  it('private visibility allows isOwner', () => {
    expect(canViewScheduleTemplate({ ...template, visibility: 'private' }, { isOwner: true })).toBe(true);
  });

  it('defaults to org visibility when absent', () => {
    const t2 = { ...template } as any;
    delete t2.visibility;
    expect(canViewScheduleTemplate(t2, { role: 'readonly' })).toBe(true);
  });
});

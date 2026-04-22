import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventDraftState } from '../useEventDraftState';

describe('useEventDraftState strict-null safety', () => {
  it('initializes safely with null inputs', () => {
    const { result } = renderHook(() => useEventDraftState(null, [], null));
    expect(result.current.values.title).toBe('');
    expect(result.current.values.meta).toEqual({});
  });

  it('validates required custom fields safely', () => {
    const config = {
      eventFields: {
        Test: [{ name: 'foo', required: true }],
      },
    };

    const { result } = renderHook(() => useEventDraftState(null, ['Test'], config));

    let isValid = true;
    act(() => {
      isValid = result.current.validate();
    });

    expect(isValid).toBe(false);
    expect(result.current.errors['meta_foo']).toBeDefined();
  });
});

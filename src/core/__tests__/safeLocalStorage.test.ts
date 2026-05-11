import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  safeGetLocalStorage,
  safeSetLocalStorage,
  safeRemoveLocalStorage,
  safeLocalStorageKeys,
} from '../safeLocalStorage';

describe('safeLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('safeGetLocalStorage', () => {
    it('returns a stored value', () => {
      localStorage.setItem('key1', 'value1');
      expect(safeGetLocalStorage('key1')).toBe('value1');
    });

    it('returns null for a missing key', () => {
      expect(safeGetLocalStorage('nonexistent')).toBeNull();
    });

    it('returns null when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(safeGetLocalStorage('key')).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('safeSetLocalStorage', () => {
    it('stores a value and returns true', () => {
      expect(safeSetLocalStorage('k', 'v')).toBe(true);
      expect(localStorage.getItem('k')).toBe('v');
    });

  });

  describe('safeRemoveLocalStorage', () => {
    it('removes a key and returns true', () => {
      localStorage.setItem('k', 'v');
      expect(safeRemoveLocalStorage('k')).toBe(true);
      expect(localStorage.getItem('k')).toBeNull();
    });

    it('returns true even for a non-existent key', () => {
      expect(safeRemoveLocalStorage('ghost')).toBe(true);
    });

  });

  describe('safeLocalStorageKeys', () => {
    it('returns all stored keys', () => {
      localStorage.setItem('a', '1');
      localStorage.setItem('b', '2');
      const keys = safeLocalStorageKeys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('returns empty array when storage is empty', () => {
      expect(safeLocalStorageKeys()).toEqual([]);
    });

    it('returns empty array when localStorage throws', () => {
      vi.spyOn(Object, 'keys').mockImplementationOnce(() => {
        throw new Error('SecurityError');
      });
      expect(safeLocalStorageKeys()).toEqual([]);
      vi.restoreAllMocks();
    });
  });
});

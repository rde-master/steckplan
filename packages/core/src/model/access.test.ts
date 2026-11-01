import { describe, expect, it } from 'vitest';
import { can, type Permission } from './access';

const all: Permission[] = ['editProject', 'checkItems', 'resetChecks', 'restoreVersion', 'manageProjects', 'viewSecrets'];

describe('Zugangsstufen', () => {
  it('local und edit dürfen alles', () => {
    for (const p of all) {
      expect(can('local', p)).toBe(true);
      expect(can('edit', p)).toBe(true);
    }
  });

  it('read darf nur abhaken', () => {
    expect(all.filter((p) => can('read', p))).toEqual(['checkItems']);
  });
});

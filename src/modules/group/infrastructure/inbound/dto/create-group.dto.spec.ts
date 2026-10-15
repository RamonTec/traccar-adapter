import { createGroupSchema } from './create-group.dto.js';

describe('createGroupSchema', () => {
  it.each([
    ['empty object', {}],
    ['non-string name', { name: 1 }],
    ['blank name', { name: '   ' }],
    ['name over 128 chars', { name: 'a'.repeat(129) }],
    ['unknown key', { name: 'a', extra: true }],
  ])('AC-4: rejects %s', (_label, value) => {
    expect(createGroupSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ['128 chars', 'a'.repeat(128)],
    ['surrounding spaces', ' acme '],
  ])('AC-4: accepts a name with %s without transforming it', (_label, name) => {
    const result = createGroupSchema.safeParse({ name });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name });
  });
});

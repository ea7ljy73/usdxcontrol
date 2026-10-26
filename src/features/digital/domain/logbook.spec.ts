import { describe, expect, it } from 'vitest'
import { resolveDxcc } from './dxcc'
import { workedIndex } from './logbook'

describe('trabajados antes', () => {
  const status = workedIndex([{ call: 'F5BZB' }, { call: 'EA7XYZ' }], (call) => resolveDxcc(call)?.entity ?? null)

  it('distingue indicativo trabajado, nuevo de un país conocido y país nuevo', () => {
    expect(status('f5bzb')).toBe('worked')
    expect(status('F4ABC')).toBe('new-call')
    expect(status('JA1ABC')).toBe('new-country')
  })
})

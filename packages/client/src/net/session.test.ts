import { afterEach, describe, expect, it } from 'vitest';
import { JoinRefusal } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { describeJoinError, describeRoomError } from './session';

describe('palvelimen virheet pelaajan kielellä', () => {
  afterEach(() => setLangForTest('fi'));

  it('liittymisen esto koodista ja vanhan palvelimen lauseesta', () => {
    expect(describeJoinError(new Error(JoinRefusal.full))).toBe('Huone on täynnä.');
    setLangForTest('en');
    expect(describeJoinError(new Error(JoinRefusal.full))).toBe('The room is full.');
    expect(describeJoinError(new Error('Huone on täynnä.'))).toBe('The room is full.');
    expect(describeJoinError(new Error(JoinRefusal.serverFull))).toContain('server is full');
    expect(describeJoinError(new Error('room "x" not found'))).toContain('not found');
    expect(describeJoinError(new Error('outo'))).toBe('Joining failed: outo');
  });

  it('aulan virhe koodista ja vanhan palvelimen lauseesta', () => {
    setLangForTest('en');
    expect(describeRoomError({ code: 'not-ready', names: ['A', 'B'] })).toBe('Waiting for: A, B');
    expect(describeRoomError('Odotetaan: A, B')).toBe('Waiting for: A, B');
    expect(describeRoomError({ code: 'host-only' })).toBe(
      'Only the room’s creator can start the race',
    );
    expect(describeRoomError('Kisaan tarvitaan ainakin yksi kalastaja')).toBe(
      'The race needs at least one angler',
    );
    expect(describeRoomError('Jotain muuta')).toBe('Jotain muuta');
  });
});

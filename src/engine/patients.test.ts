import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, evaluateCondition, runActions } from './index';
import type { Adventure } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function adventureWithPatient(): Adventure {
  return {
    title: 't',
    startScene: 'hub',
    scenes: {
      hub: { name: 'Hub', kind: 'hub' },
      dream: { name: 'Dream', kind: 'dream' },
    },
    patients: {
      whitfield: {
        name: 'Catherine Whitfield',
        presenting: '...',
        file: '...',
        dreamScene: 'dream',
      },
    },
  };
}

describe('patient model', () => {
  it('setPatientStatus and recordPatientNote populate state lazily', async () => {
    const engine = new GameEngine(adventureWithPatient());
    await runActions(
      [
        { type: 'setPatientStatus', patient: 'whitfield', status: 'inResidence' },
        { type: 'recordPatientNote', patient: 'whitfield', note: 'a note' },
        { type: 'recordPatientNote', patient: 'whitfield', note: 'a note' },
      ],
      { engine },
    );
    const entry = engine.state.patientState.whitfield;
    expect(entry.status).toBe('inResidence');
    expect(entry.notes).toEqual(['a note']);
  });

  it('patientStatus and patientHas conditions read state', async () => {
    const engine = new GameEngine(adventureWithPatient());
    await runActions(
      [
        { type: 'setPatientStatus', patient: 'whitfield', status: 'improving' },
        { type: 'recordPatientNote', patient: 'whitfield', note: 'walked' },
      ],
      { engine },
    );
    expect(
      evaluateCondition(
        { type: 'patientStatus', patient: 'whitfield', status: 'improving' },
        { engine },
      ),
    ).toBe(true);
    expect(
      evaluateCondition({ type: 'patientHas', patient: 'whitfield', note: 'walked' }, { engine }),
    ).toBe(true);
    expect(
      evaluateCondition({ type: 'patientHas', patient: 'whitfield', note: 'nope' }, { engine }),
    ).toBe(false);
  });

  it('enterDream bumps sessionsCompleted, marks active patient, navigates to dreamScene', async () => {
    const engine = new GameEngine(adventureWithPatient());
    await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
    expect(engine.state.activePatientId).toBe('whitfield');
    expect(engine.state.patientState.whitfield.sessionsCompleted).toBe(1);
    expect(engine.state.currentSceneId).toBe('dream');
    expect(evaluateCondition({ type: 'inDream' }, { engine })).toBe(true);
  });

  it('wake clears activePatientId and navigates to the wake scene', async () => {
    const engine = new GameEngine(adventureWithPatient());
    await runActions(
      [
        { type: 'enterDream', patient: 'whitfield' },
        { type: 'wake', scene: 'hub' },
      ],
      { engine },
    );
    expect(engine.state.activePatientId).toBeNull();
    expect(engine.state.currentSceneId).toBe('hub');
    expect(evaluateCondition({ type: 'inDream' }, { engine })).toBe(false);
  });

  it('speakExitPhrase only wakes when phrase matches expected', async () => {
    const engine = new GameEngine(adventureWithPatient());
    await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });

    await runActions(
      [
        {
          type: 'speakExitPhrase',
          phrase: 'wrong',
          expected: 'open sesame',
          wakeScene: 'hub',
          onWrong: [{ type: 'narrate', text: 'still in dream' }],
        },
      ],
      { engine },
    );
    expect(engine.state.currentSceneId).toBe('dream');
    expect(engine.state.narration.some((n) => n.text === 'still in dream')).toBe(true);

    await runActions(
      [
        {
          type: 'speakExitPhrase',
          phrase: 'open sesame',
          expected: 'open sesame',
          wakeScene: 'hub',
        },
      ],
      { engine },
    );
    expect(engine.state.currentSceneId).toBe('hub');
    expect(engine.state.activePatientId).toBeNull();
  });
});

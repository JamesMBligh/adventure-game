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

  it('initialState.patientState seeds patient runtime state at construction', () => {
    const adventure = adventureWithPatient();
    adventure.initialState = {
      patientState: {
        whitfield: { status: 'inResidence', sessionsCompleted: 2, notes: ['a prior note'] },
      },
    };
    const engine = new GameEngine(adventure);
    expect(engine.state.patientState.whitfield).toEqual({
      status: 'inResidence',
      sessionsCompleted: 2,
      notes: ['a prior note'],
    });
    expect(
      evaluateCondition(
        { type: 'patientStatus', patient: 'whitfield', status: 'inResidence' },
        { engine },
      ),
    ).toBe(true);
  });

  it('initialState seeds activePatientId so debug profiles can boot inside a dream', () => {
    const adventure = adventureWithPatient();
    adventure.initialState = {
      activePatientId: 'whitfield',
      preDreamNarration: [
        { id: 1, kind: 'narration', text: 'Mansion line.' },
      ],
      patientState: {
        whitfield: { status: 'inResidence', sessionsCompleted: 1 },
      },
    };
    const engine = new GameEngine(adventure);
    expect(engine.state.activePatientId).toBe('whitfield');
    expect(engine.state.preDreamNarration).toEqual([
      expect.objectContaining({ text: 'Mansion line.' }),
    ]);
    // The narration log itself starts empty — the dream begins fresh.
    expect(engine.state.narration).toEqual([]);
  });

  it('initialState.patientState fills in defaults for omitted fields', () => {
    const adventure = adventureWithPatient();
    adventure.initialState = {
      patientState: { whitfield: { status: 'inResidence' } },
    };
    const engine = new GameEngine(adventure);
    expect(engine.state.patientState.whitfield).toEqual({
      status: 'inResidence',
      sessionsCompleted: 0,
      notes: [],
    });
  });

  describe('dream-log snapshot / restore', () => {
    it('enterDream snapshots the mansion log and clears it; wake restores it', async () => {
      const engine = new GameEngine(adventureWithPatient());
      // Seed a mansion-side log entry.
      engine.pushNarration({ kind: 'narration', text: 'You stand in the study.' });
      expect(engine.state.narration).toHaveLength(1);

      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      // Inside the dream: log is empty (the snapshot saved the prior entry).
      expect(engine.state.narration).toEqual([]);
      expect(engine.state.preDreamNarration).toEqual([
        expect.objectContaining({ text: 'You stand in the study.' }),
      ]);

      // Dream-side narration appended.
      engine.pushNarration({ kind: 'narration', text: 'The hall is enormous.' });
      expect(engine.state.narration).toHaveLength(1);
      expect(engine.state.narration[0].text).toBe('The hall is enormous.');

      await runActions([{ type: 'wake', scene: 'hub' }], { engine });
      // The mansion log is back; the dream log is discarded.
      expect(engine.state.narration).toEqual([
        expect.objectContaining({ text: 'You stand in the study.' }),
      ]);
      expect(engine.state.preDreamNarration).toBeNull();
    });

    it('speakExitPhrase wake branch restores the mansion log', async () => {
      const engine = new GameEngine(adventureWithPatient());
      engine.pushNarration({ kind: 'narration', text: 'Mansion line.' });
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      engine.pushNarration({ kind: 'narration', text: 'Dream line.' });

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
      // The mansion line is back. The dream line is gone. (The exit-phrase
      // echo also lived in the dream log and is correctly discarded.)
      const texts = engine.state.narration.map((n) => n.text);
      expect(texts).toContain('Mansion line.');
      expect(texts).not.toContain('Dream line.');
    });

    it('nested enterDream calls do not lose the original snapshot', async () => {
      const engine = new GameEngine(adventureWithPatient());
      engine.pushNarration({ kind: 'narration', text: 'Mansion.' });

      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      // Pretend the dream emits something then re-enters (defensive: nested
      // dream call shouldn't trample the snapshot).
      engine.pushNarration({ kind: 'narration', text: 'In dream.' });
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });

      // The original mansion log is still snapshotted (first wins).
      expect(engine.state.preDreamNarration).toEqual([
        expect.objectContaining({ text: 'Mansion.' }),
      ]);

      await runActions([{ type: 'wake', scene: 'hub' }], { engine });
      expect(engine.state.narration.map((n) => n.text)).toEqual(['Mansion.']);
    });

    it('restoreNarrationAfterDream is a no-op when no snapshot is held', () => {
      const engine = new GameEngine(adventureWithPatient());
      engine.pushNarration({ kind: 'narration', text: 'Only line.' });
      engine.restoreNarrationAfterDream();
      // Log unchanged.
      expect(engine.state.narration).toEqual([
        expect.objectContaining({ text: 'Only line.' }),
      ]);
    });

    it('snapshot survives serialize/restore (so saves taken in-dream restore cleanly)', () => {
      const engine = new GameEngine(adventureWithPatient());
      engine.pushNarration({ kind: 'narration', text: 'Pre-dream.' });
      engine.snapshotNarrationForDream();
      engine.pushNarration({ kind: 'narration', text: 'In dream.' });

      const snap = engine.serialize();
      const fresh = new GameEngine(adventureWithPatient());
      expect(fresh.restore(snap)).toBe(true);

      expect(fresh.state.narration.map((n) => n.text)).toEqual(['In dream.']);
      expect(fresh.state.preDreamNarration).toEqual([
        expect.objectContaining({ text: 'Pre-dream.' }),
      ]);

      fresh.restoreNarrationAfterDream();
      expect(fresh.state.narration.map((n) => n.text)).toEqual(['Pre-dream.']);
      expect(fresh.state.preDreamNarration).toBeNull();
    });
  });

  describe('dream-transition overlay', () => {
    it('enterDream runs through entering in→hold→out and lands on null', async () => {
      const engine = new GameEngine(adventureWithPatient());
      const phases: Array<typeof engine.dreamTransition.value> = [];
      const unwatch = (await import('vue')).watchEffect(() => {
        phases.push(engine.dreamTransition.value);
      });
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      unwatch();
      // Initial null + the three phases + final null. Direction is "entering".
      expect(phases.filter((p) => p !== null).map((p) => p!.phase)).toEqual(['in', 'hold', 'out']);
      expect(phases.filter((p) => p !== null).every((p) => p!.direction === 'entering')).toBe(true);
      expect(engine.dreamTransition.value).toBeNull();
      // Scene change still happens: we land in the dream during the hold phase.
      expect(engine.state.currentSceneId).toBe('dream');
    });

    it('wake runs through exiting in→hold→out and lands on null', async () => {
      const engine = new GameEngine(adventureWithPatient());
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      const phases: Array<typeof engine.dreamTransition.value> = [];
      const unwatch = (await import('vue')).watchEffect(() => {
        phases.push(engine.dreamTransition.value);
      });
      await runActions([{ type: 'wake', scene: 'hub' }], { engine });
      unwatch();
      expect(phases.filter((p) => p !== null).map((p) => p!.phase)).toEqual(['in', 'hold', 'out']);
      expect(phases.filter((p) => p !== null).every((p) => p!.direction === 'exiting')).toBe(true);
      expect(engine.dreamTransition.value).toBeNull();
      expect(engine.state.currentSceneId).toBe('hub');
    });

    it('speakExitPhrase wake branch fires the exiting transition', async () => {
      const engine = new GameEngine(adventureWithPatient());
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      const phases: Array<typeof engine.dreamTransition.value> = [];
      const unwatch = (await import('vue')).watchEffect(() => {
        phases.push(engine.dreamTransition.value);
      });
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
      unwatch();
      expect(phases.some((p) => p?.direction === 'exiting' && p.phase === 'hold')).toBe(true);
      expect(engine.dreamTransition.value).toBeNull();
    });

    it('dreamTransition action runs nested actions during the hold phase', async () => {
      const engine = new GameEngine(adventureWithPatient());
      const phasesSeen: Array<typeof engine.dreamTransition.value> = [];
      let sceneAtNestedCall: string | null = 'unset';
      let nestedRan = false;
      const unwatch = (await import('vue')).watchEffect(() => {
        phasesSeen.push(engine.dreamTransition.value);
      });
      // Custom probe action so we can observe the phase at the moment the
      // nested action list executes.
      const probeName = '__test_probe__';
      const reg = (await import('./registry')).actionRegistry;
      reg.register(probeName, (_a, { engine }) => {
        nestedRan = true;
        sceneAtNestedCall = engine.dreamTransition.value?.phase ?? null;
      });
      await runActions(
        [
          {
            type: 'dreamTransition',
            direction: 'entering',
            actions: [{ type: probeName }, { type: 'goto', scene: 'dream' }],
          },
        ],
        { engine },
      );
      unwatch();
      expect(nestedRan).toBe(true);
      expect(sceneAtNestedCall).toBe('hold');
      expect(engine.state.currentSceneId).toBe('dream');
      expect(engine.dreamTransition.value).toBeNull();
      const nonNull = phasesSeen.filter((p) => p !== null);
      expect(nonNull.map((p) => p!.phase)).toEqual(['in', 'hold', 'out']);
    });

    it('dreamTransition with no nested actions is a pure visual pause', async () => {
      const engine = new GameEngine(adventureWithPatient());
      const before = engine.state.currentSceneId;
      await runActions(
        [{ type: 'dreamTransition', direction: 'exiting' }],
        { engine },
      );
      // No scene change, no patient mutation; just ran the overlay.
      expect(engine.state.currentSceneId).toBe(before);
      expect(engine.dreamTransition.value).toBeNull();
    });

    it('speakExitPhrase wrong-phrase branch does NOT fire the transition', async () => {
      const engine = new GameEngine(adventureWithPatient());
      await runActions([{ type: 'enterDream', patient: 'whitfield' }], { engine });
      const phases: Array<typeof engine.dreamTransition.value> = [];
      const unwatch = (await import('vue')).watchEffect(() => {
        phases.push(engine.dreamTransition.value);
      });
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
      unwatch();
      // Only the initial null observation should have been recorded — no phases.
      expect(phases.filter((p) => p !== null)).toEqual([]);
      expect(engine.state.currentSceneId).toBe('dream');
    });
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

import { describe, it, expect, beforeAll } from 'vitest';
import { ensureBuiltInsRegistered, GameEngine, runActions } from './index';
import type { Adventure, CaseFile } from '../types';

beforeAll(() => {
  ensureBuiltInsRegistered();
});

function adv(caseFiles: CaseFile[] = [], flags: Adventure['flags'] = {}): Adventure {
  return {
    title: 't',
    startScene: 'hub',
    scenes: {
      hub: { name: 'Hub', kind: 'hub' },
      dream: { name: 'Dream', kind: 'dream' },
    },
    flags,
    patients: {
      whitfield: { name: 'Catherine Whitfield', dreamScene: 'dream' },
    },
    caseFiles,
  };
}

const exampleCase = (overrides: Partial<CaseFile> = {}): CaseFile => ({
  id: 'ex',
  label: 'Example',
  documents: [{ id: 'intro', label: 'Intro', content: '# hello' }],
  ...overrides,
});

describe('availableCaseFiles', () => {
  it('is empty when no case files are authored', () => {
    const engine = new GameEngine(adv());
    expect(engine.availableCaseFiles.value).toEqual([]);
  });

  it('returns all cases when none have availableIf', () => {
    const engine = new GameEngine(adv([exampleCase()]));
    expect(engine.availableCaseFiles.value).toHaveLength(1);
    expect(engine.availableCaseFiles.value[0].id).toBe('ex');
  });

  it('filters cases by availableIf', async () => {
    const engine = new GameEngine(
      adv(
        [
          exampleCase({
            availableIf: { type: 'flag', flag: 'introCompleted' },
          }),
        ],
        { introCompleted: { default: false } },
      ),
    );
    expect(engine.availableCaseFiles.value).toHaveLength(0);
    await runActions([{ type: 'setFlag', flag: 'introCompleted', value: true }], { engine });
    expect(engine.availableCaseFiles.value).toHaveLength(1);
  });

  it('isDocumentAvailable filters per-document availableIf', async () => {
    const engine = new GameEngine(
      adv(
        [
          exampleCase({
            documents: [
              { id: 'always', label: 'Always', content: '' },
              {
                id: 'gated',
                label: 'Gated',
                content: '',
                availableIf: { type: 'flag', flag: 'reveal' },
              },
            ],
          }),
        ],
        { reveal: { default: false } },
      ),
    );
    const docs = engine.availableCaseFiles.value[0].documents;
    expect(engine.isDocumentAvailable(docs[0])).toBe(true);
    expect(engine.isDocumentAvailable(docs[1])).toBe(false);
    await runActions([{ type: 'setFlag', flag: 'reveal', value: true }], { engine });
    expect(engine.isDocumentAvailable(docs[1])).toBe(true);
  });

  it('dream-style patient-availability gate hides cases until patient is in residence', async () => {
    // Simulates what the loader installs on dream-sourced cases.
    const patientGate: CaseFile = exampleCase({
      id: 'whitfield',
      label: 'Whitfield, C.',
      availableIf: {
        type: 'or',
        conditions: [
          { type: 'patientStatus', patient: 'whitfield', status: 'inResidence' },
          { type: 'patientStatus', patient: 'whitfield', status: 'improving' },
          { type: 'patientStatus', patient: 'whitfield', status: 'healed' },
        ],
      },
    });
    const engine = new GameEngine(adv([patientGate]));
    expect(engine.availableCaseFiles.value).toHaveLength(0);
    await runActions(
      [{ type: 'setPatientStatus', patient: 'whitfield', status: 'inResidence' }],
      { engine },
    );
    expect(engine.availableCaseFiles.value).toHaveLength(1);
  });

  it('reactive — flipping a flag updates the computed without rebuilding the engine', async () => {
    const engine = new GameEngine(
      adv(
        [exampleCase({ availableIf: { type: 'flag', flag: 'show' } })],
        { show: { default: false } },
      ),
    );
    expect(engine.availableCaseFiles.value).toHaveLength(0);
    await runActions([{ type: 'setFlag', flag: 'show', value: true }], { engine });
    expect(engine.availableCaseFiles.value).toHaveLength(1);
    await runActions([{ type: 'setFlag', flag: 'show', value: false }], { engine });
    expect(engine.availableCaseFiles.value).toHaveLength(0);
  });
});

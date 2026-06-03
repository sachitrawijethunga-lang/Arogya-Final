export const SCREENING_ITEM_COUNT = 11;

export interface ScreeningState {
  flags: boolean[]; // length SCREENING_ITEM_COUNT
  none: boolean;
}

export function emptyScreeningState(): ScreeningState {
  return { flags: Array(SCREENING_ITEM_COUNT).fill(false), none: false };
}

// Toggling any symptom clears the "None of the above" selection.
export function toggleSymptom(state: ScreeningState, index: number): ScreeningState {
  return {
    flags: state.flags.map((f, i) => (i === index ? !f : f)),
    none: false,
  };
}

// Selecting "None of the above" clears every symptom.
export function toggleNone(state: ScreeningState): ScreeningState {
  const none = !state.none;
  return {
    flags: none ? Array(SCREENING_ITEM_COUNT).fill(false) : state.flags,
    none,
  };
}

export function isScreeningComplete(state: ScreeningState, consent: boolean): boolean {
  const anyChecked = state.flags.some((f) => f);
  return consent && (anyChecked || state.none);
}

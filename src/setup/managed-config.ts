export interface ManagedConfigConflict {
  location: string;
  reason: string;
  forceable: boolean;
}

export interface ManagedConfigVerification {
  beforeValid: boolean;
  afterValid: boolean;
  ownedValuesMatch: boolean;
}

export interface ManagedConfigPlan {
  before: string | null;
  after: string;
  changed: boolean;
  forced: boolean;
  ownedLocations: string[];
  conflicts: ManagedConfigConflict[];
  verification: ManagedConfigVerification;
}

export const INVALID_ROOT_REASON = 'The configuration document is not valid.';

export function createManagedConfigConflictPlan(
  before: string | null,
  ownedLocations: string[],
  conflict: ManagedConfigConflict,
  beforeValid: boolean,
): ManagedConfigPlan {
  return {
    before,
    after: before ?? '',
    changed: false,
    forced: false,
    ownedLocations,
    conflicts: [conflict],
    verification: {
      beforeValid,
      afterValid: beforeValid,
      ownedValuesMatch: false,
    },
  };
}

/**
 * Product rules that both repositories and the UI must agree on.
 *
 * One experiment at a time: the whole point of the app is attributing a change
 * in the data to one behaviour. Two overlapping experiments make that
 * impossible, so the database (partial unique index), the repositories and the
 * wizard all enforce a single active experiment per user.
 */
export const MAX_ACTIVE_EXPERIMENTS = 1;

export const ONE_ACTIVE_EXPERIMENT_MESSAGE =
  'You already have an experiment running. Finish or abandon it before starting a new one, so each result can be traced to one behaviour.';

export class ActiveExperimentExistsError extends Error {
  constructor() {
    super(ONE_ACTIVE_EXPERIMENT_MESSAGE);
    this.name = 'ActiveExperimentExistsError';
  }
}

// 8.12 — Maintenance task: ensure today's net-worth snapshot is captured.
//
// 7.13 stamps a snapshot on every account mutation, so the row for today
// almost always exists during normal use. This task closes the gap for
// days when the user doesn't open the app at all: the next bg→fg fires
// the maintenance loop, sees today's row is missing, and stamps it. The
// trajectory chart in NetWorth stays unbroken across long quiet stretches.
//
// The helper is `if-missing` rather than unconditional: AccountsProvider
// already covers today in active sessions, and the maintenance loop is
// supposed to be cheap. No reason to write twice.

import { snapshotsRepo } from '../../features/accounts/snapshot';

export default {
  name: 'accountSnapshot',
  async run() {
    return snapshotsRepo.ensureTodaySnapshotIfMissing();
  },
};

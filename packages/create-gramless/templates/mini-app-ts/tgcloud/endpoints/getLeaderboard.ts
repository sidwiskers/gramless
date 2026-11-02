import { createEndpoint } from 'gramless/endpoint';
import { db } from 'sdk';
import { desc } from 'sdk/db';
import { leaderboard } from '../schema.js';

export default createEndpoint({
  requireAuth: false,
}, async () => {
  const topScores = await db
    .select()
    .from(leaderboard)
    .orderBy(desc(leaderboard.score))
    .limit(10)
    .run();

  return { leaderboard: topScores };
});

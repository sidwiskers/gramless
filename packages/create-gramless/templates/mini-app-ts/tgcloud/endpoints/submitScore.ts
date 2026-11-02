import { createEndpoint, v } from 'gramless/endpoint';
import { db } from 'sdk';
import { leaderboard } from '../schema.js';

export default createEndpoint({
  requireAuth: true,
  schema: v.object({
    score: v.number({ min: 1, max: 1000000 }),
  }),
}, async (ctx) => {
  const user = ctx.user!;
  const { score } = ctx.input;

  await db.insert(leaderboard).values({
    userId: user.id,
    firstName: user.first_name || 'Anonymous',
    score,
  }).run();

  return { success: true, score };
});

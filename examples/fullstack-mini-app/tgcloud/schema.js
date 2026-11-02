import { table, integer, text, index, sql } from 'sdk/db';

export const leaderboard = table('leaderboard', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  firstName: text('first_name').notNull(),
  score: integer('score').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  scoreIdx: index('idx_leaderboard_score').on(t.score),
}));

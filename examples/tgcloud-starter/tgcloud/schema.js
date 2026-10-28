import { table, text, json, integer, sql } from 'sdk/db';

/**
 * Standard Gramless Session table declaration for Telegram Serverless SQLite.
 */
export const sessions = table('gramless_sessions', {
  id: text('id').primaryKey(),
  data: json('data').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

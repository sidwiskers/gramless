import { table, integer, text, json } from 'sdk/db';

export const sessions = table('sessions', {
  id: text('id').primaryKey(),
  data: json('data'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

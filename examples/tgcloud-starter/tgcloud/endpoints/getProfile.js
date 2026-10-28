import { createEndpoint, v } from 'gramless/endpoint';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';

export default createEndpoint({
  requireAuth: true,
  schema: v.object({
    includeNotes: v.optional(v.boolean()),
  }),
}, async (ctx) => {
  const user = ctx.user;

  // Retrieve user session data from SQLite
  const sessionRow = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, `chat_user:${user.id}:${user.id}`))
    .get();

  const sessionData = sessionRow?.data ? (typeof sessionRow.data === 'string' ? JSON.parse(sessionRow.data) : sessionRow.data) : {};

  return {
    user: {
      id: user.id,
      firstName: user.first_name,
      username: user.username,
      languageCode: user.language_code,
    },
    notes: ctx.input.includeNotes !== false ? (sessionData.notes || []) : undefined,
  };
});

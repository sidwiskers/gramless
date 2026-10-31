import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaGroup } from '../src/media_group.js';
import { GramlessRouter } from '../src/router.js';

test('mediaGroup: consolidates multiple album updates sharing media_group_id', async () => {
  const router = new GramlessRouter();
  const handledBatches = [];

  router.use(mediaGroup({ timeout: 40 }));

  router.on('photo', async (ctx) => {
    handledBatches.push({
      itemCount: ctx.mediaGroup ? ctx.mediaGroup.length : 1,
      items: ctx.mediaGroup,
    });
  });

  const albumId = 'album_group_777';
  const chat = { id: 10 };
  const from = { id: 10 };

  // Simulate Telegram sending 3 photo updates in rapid succession for the same album
  const p1 = router.handle({ chat, from, photo: [{ file_id: 'ph1' }], media_group_id: albumId });
  const p2 = router.handle({ chat, from, photo: [{ file_id: 'ph2' }], media_group_id: albumId });
  const p3 = router.handle({ chat, from, photo: [{ file_id: 'ph3' }], media_group_id: albumId });

  await Promise.all([p1, p2, p3]);

  // Invariant: The handler should only be called ONCE with all 3 photos aggregated!
  assert.equal(handledBatches.length, 1);
  assert.equal(handledBatches[0].itemCount, 3);
  assert.equal(handledBatches[0].items[0].photo[0].file_id, 'ph1');
  assert.equal(handledBatches[0].items[1].photo[0].file_id, 'ph2');
  assert.equal(handledBatches[0].items[2].photo[0].file_id, 'ph3');
});

test('mediaGroup: allows normal single messages to pass through immediately', async () => {
  const router = new GramlessRouter();
  const singleMessages = [];

  router.use(mediaGroup({ timeout: 50 }));

  router.on('photo', async (ctx) => {
    singleMessages.push(ctx.raw.photo[0].file_id);
  });

  const chat = { id: 10 };
  const from = { id: 10 };

  // Single photo message without media_group_id
  await router.handle({ chat, from, photo: [{ file_id: 'single_photo' }] });

  assert.equal(singleMessages.length, 1);
  assert.equal(singleMessages[0], 'single_photo');
});

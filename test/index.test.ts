import { v4 as uuid } from 'uuid';
import { MessageDbClient } from '../src';

test('it should connect client, write to stream, and read from stream', async () => {
  const mdbClient = new MessageDbClient({
    dbUri: 'postgres://postgres@localhost:5433/message_store',
  });
  const viewedEvent = {
    id: uuid(),
    type: 'TestInitialized',
    metadata: {
      traceId: uuid(),
      userId: uuid(),
    },
    data: {
      userId: uuid(),
      videoId: uuid(),
    },
  };
  const streamName = `testing-${uuid()}`; // (3)

  await mdbClient.writeToStream(streamName, viewedEvent, -1);

  const messages = await mdbClient.readStream(streamName);

  expect(messages.length).toBe(1);

  return mdbClient.shutdown();
});

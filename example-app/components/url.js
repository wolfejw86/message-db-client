const fp = require('fastify-plugin');
const { MessageDbClient, formatStreamMessage } = require('../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = fp(
  async function (fastify) {

    /**
     * Projection that builds a user entity based on 1000 events or less
     */
    const urlProjection = {
      $init() {
        return {
          id: null,
          redirectToUrl: null,
          userId: null,
          isCreated: false,
        };
      },
      UrlCreated(urlEntity, created) {
        urlEntity.id = created.data.urlId;
        urlEntity.userId = created.data.userId;
        urlEntity.redirectToUrl = created.data.url;
        urlEntity.isCreated = true;

        return urlEntity;
      },
    };

    const urlCommandSubscriber = fastify.messageStore.createSubscriber({
      handlers: {
        UrlCreate: async command => {
          const urlStream = `url-${command.data.urlId}`;
          // loading is necessary to determine if it's been created before
          // can also be useful for snapshot retreival / storage before doing business logic
          const existingEntity = await fastify.messageStore.loadEntity(
            urlStream,
            urlProjection
          );

          if (existingEntity.isCreated) {
            // noop because we've already done this and this is a replay
            return;
          }

          // we have a new user registration - record event for aggregators and history
          const urlCreatedEvent = formatStreamMessage(
            'UrlCreated',
            command.data,
            command.metadata
          );

          await fastify.messageStore.writeToStream(
            urlStream,
            urlCreatedEvent
          );
        },
      },
      streamName: 'url:command',
      subscriberId: 'components:url:command',
    });
    /**
     * start once server
     */
    urlCommandSubscriber.start().catch(err => {
      console.log(err);
      throw err;
    });

    fastify.addHook('onClose', async () => {
      await urlCommandSubscriber.stop();
    });
  },
  {
    dependencies: ['message-store'],
  }
);

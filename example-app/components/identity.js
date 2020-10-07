const fp = require('fastify-plugin');
const { MessageDbClient, formatStreamMessage } = require('../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = fp(
  async function(fastify) {

    /**
     * Projection that builds a user entity based on 1000 events or less
     */
    const userIdentityProjection = {
      $init() {
        return {
          id: null,
          email: null,
          isRegistered: false,
          registrationEmailSent: false,
        };
      },
      Registered(identity, registered) {
        identity.id = registered.data.userId;
        identity.email = registered.data.email;
        identity.nickname = registered.data.nickname;
        identity.isRegistered = true;

        return identity;
      },
    };

    const registerCommandSubscriber = fastify.messageStore.createSubscriber({
      handlers: {
        Register: async command => {
          const currentIdentityStream = `identity-${command.data.userId}`;
          const existingEntity = await fastify.messageStore.loadEntity(
            currentIdentityStream,
            userIdentityProjection
          );

          if (existingEntity.isRegistered) {
            // noop because we've already done this and this is a replay
            return;
          }

          // we have a new user registration - record event for aggregators and history
          const userRegisteredEvent = formatStreamMessage(
            'Registered',
            command.data,
            command.metadata
          );

          await fastify.messageStore.writeToStream(
            currentIdentityStream,
            userRegisteredEvent
          );
        },
      },
      streamName: 'identity:command',
      subscriberId: 'components:identity:command',
    });

    /**
     * start once server
     */
    registerCommandSubscriber.start().catch(err => {
      console.log(err);
      throw err;
    });

    fastify.addHook('onClose', async () => {
      await registerCommandSubscriber.stop();
    });
  },
  {
    dependencies: ['message-store'],
  }
);

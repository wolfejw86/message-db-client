const fp = require('fastify-plugin');
const { MessageDbClient } = require('../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = fp(
  async function(fastify) {
    const userCredentialsDenormalizerSub = fastify.messageStore.createSubscriber(
      {
        handlers: {
          Registered: async event => {
            await fastify.appDb.query(
              `
        INSERT INTO user_credentials
          (id, email, password_hash)
            VALUES
          ($1, $2, $3)
        ON CONFLICT DO NOTHING
        `,
              [event.data.userId, event.data.email, event.data.passwordHash]
            );
          },
        },
        streamName: 'identity',
        subscriberId: 'denormalizers:user-credentials',
      }
    );

    userCredentialsDenormalizerSub.start().catch(err => {
      console.log(err);
      throw err;
    });

    fastify.addHook('onClose', async () => {
      await userCredentialsDenormalizerSub.stop();
    });
  },
  { dependencies: ['message-store'] }
);

const { MessageDbClient } = require('../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = async function(fastify) {
  fastify.messageStore.createSubscriber({
    handlers: {},
    streamName: 'identity:command',
  });
  //
};

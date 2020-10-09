const uuid = require('uuid').v4;
const camelcase = require('camelcase-keys');
const argon2 = require('argon2');
const { MessageDbClient, formatStreamMessage } = require('../../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = function (fastify, opts, next) {
  fastify.get('/:urlShortId', async (request, reply) => {
    const { traceId, userId } = request.ctx;
    const { urlShortId } = request.params;

    const url = await fastify.appDb.one('SELECT id, redirect_to_url FROM urls WHERE id = $1', [urlShortId]);

    console.log({ url })

    const streamName = `url-${urlShortId}`;
    await fastify.messageStore.writeToStream(
      streamName,
      formatStreamMessage(
        'UrlVisited',
        { urlId: urlShortId },
        { traceId, userId }
      ),
    )

    reply.redirect(url.redirect_to_url)
  });

  fastify.post('/url', async (request, reply) => {
    const { userId, traceId } = request.ctx;

    if (!userId) {
      return reply.redirect('/login')
    }

    const { url, urlId } = request.body;
    const streamName = `url:command-${urlId}`;
    const command = fastify.messageStore.formatStreamMessage('UrlCreate', { urlId, url, userId }, { userId, traceId });

    await fastify.messageStore.writeToStream(streamName, command, -1);

    return reply.view(
      '/views/url/url-creation-complete.hbs',
      { url: `/${urlId}` }
    );
  });

  next();
};

module.exports.autoPrefix = '/';

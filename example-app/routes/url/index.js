const uuid = require('uuid').v4;
const camelcase = require('camelcase-keys');
const argon2 = require('argon2');
const { MessageDbClient, formatStreamMessage } = require('../../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = function (fastify, opts, next) {
  fastify.get('/:userNickname/:urlShortId', async (request, reply) => {
    const { userNickname, urlShortId } = request.params;

    return { userNickname, urlShortId }
  });

  fastify.post('/url', async (request, reply) => {
    const { userId, traceId } = request.ctx;

    if (!userId) {
      return reply.redirect('/login')
    }

    const { nickname } = await fastify.appDb.query(
      'SELECT nickname FROM user_credentials WHERE id = $1',
      [userId]
    )
      .then(rows => rows[0]);

    const { url, urlId } = request.body;
    const streamName = `url:command-${urlId}`;
    const command = fastify.messageStore.formatStreamMessage('UrlCreate', { urlId, url, userId, nickname }, { userId, traceId });

    await fastify.messageStore.writeToStream(streamName, command, -1);

    return reply.view(
      '/views/url/url-creation-complete.hbs',
      { url: `${request.headers.origin}/${nickname}/${urlId}` }
    );
  });

  next();
};

module.exports.autoPrefix = '/';

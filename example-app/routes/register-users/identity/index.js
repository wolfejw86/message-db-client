const uuid = require('uuid').v4;
const argon2 = require('argon2');
const { MessageDbClient, formatStreamMessage } = require('../../../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = function(fastify, opts, next) {
  fastify.get('/register', async (request, reply) => {
    return reply.view('/identity/register-user.handlebars', {
      userId: uuid(),
    });
  });

  fastify.post('/register', async (request, reply) => {
    const { email, userId, password } = request.body;
    const { traceId } = request.ctx;

    const emailExists = await fastify.appDb
      .query('SELECT email from user_credentials WHERE email = $1', [email])
      .then(rows => Boolean(rows[0]));

    if (emailExists) {
      return reply.code(400).view('/identity/register-user-error.handlebars', {
        error: 'Already Taken',
      });
    }

    const passwordHash = await argon2.hash(password);
    const stream = `identity:command-${userId}`;
    const command = formatStreamMessage(
      'Register',
      { userId, email, passwordHash },
      { traceId, userId }
    );

    await fastify.messageStore.writeToStream(stream, command, -1);

    reply.redirect('/registration-complete');
  });

  fastify.get('/registration-complete', async (request, reply) => {
    return reply.view('/identity/registration-complete.handlebars');
  });

  next();
};

module.exports.autoPrefix = '/';

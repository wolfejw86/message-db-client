const uuid = require('uuid').v4;
const camelcase = require('camelcase-keys');
const argon2 = require('argon2');
const { nanoid } = require('nanoid')
const { MessageDbClient, formatStreamMessage } = require('../../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = function (fastify, opts, next) {
  fastify.get('/register', async (request, reply) => {
    return reply.view('/views/identity/register-user.hbs', {
      userId: uuid(),
    });
  });

  fastify.post('/register', async (request, reply) => {
    const { email, nickname, userId, password } = request.body;
    const { traceId } = request.ctx;

    const emailOrNicknameExists = await fastify.appDb
      .query('SELECT email from user_credentials WHERE email = $1 OR nickname = $2', [email, nickname])
      .then(rows => Boolean(rows[0]));

    if (emailOrNicknameExists) {
      return reply.code(400).view('/views/identity/register-user-error'.hbs, {
        error: 'Already Taken',
      });
    }

    const passwordHash = await argon2.hash(password);
    const stream = `identity:command-${userId}`;
    const command = formatStreamMessage(
      'Register',
      { userId, email, nickname, passwordHash },
      { traceId, userId }
    );

    await fastify.messageStore.writeToStream(stream, command, -1);

    reply.redirect('/registration-complete');
  });

  fastify.get('/registration-complete', async (request, reply) => {
    return reply.view('/views/identity/registration-complete.hbs');
  });

  fastify.get('/login', async (request, reply) => {
    return reply.view('/views/identity/login.hbs');
  });

  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body;

    const existingUser = await fastify.appDb
      .query('SELECT * from user_credentials WHERE email = $1', [email])
      .then(rows => camelcase(rows[0]));

    if (!existingUser) {
      return reply.redirect('/login');
    }

    const hasValidPassword = await argon2.verify(
      existingUser.passwordHash,
      password
    );

    if (!hasValidPassword) {
      return reply.redirect('/login');
    }

    request.session.userId = existingUser.id;
    delete existingUser.passwordHash;

    return reply.view('/views/identity/profile.hbs', { ...existingUser, urlId: nanoid(7) });
  });

  fastify.get('/profile', async (request, reply) => {
    if (!request.session.userId) {
      return reply.redirect('/login');
    }

    const user = await fastify.appDb
      .query('SELECT id, email, nickname FROM user_credentials WHERE id = $1', [
        request.session.userId,
      ])
      .then(rows => camelcase(rows[0]));

    return reply.view('/views/identity/profile.hbs', { ...user, urlId: nanoid(7) });
  });

  next();
};

module.exports.autoPrefix = '/';

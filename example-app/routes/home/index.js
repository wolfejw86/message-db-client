const uuid = require('uuid').v4;
const camelcase = require('camelcase-keys');
const argon2 = require('argon2');
const { MessageDbClient, formatStreamMessage } = require('../../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = function (fastify, opts, next) {
  fastify.get('/', async (request, reply) => {
    return reply.view('/views/home/index.hbs')
  });

  next();
};

module.exports.autoPrefix = '/';

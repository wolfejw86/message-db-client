const Fastify = require('fastify');
const uuid = require('uuid').v4;
const fp = require('fastify-plugin');
const { context } = require('tap');

/**
 *
 * @param {Fastify.FastifyInstance} fastify
 */
module.exports = fp(function(fastify, opts, next) {
  fastify.decorateRequest('ctx', {
    getter() {
      if (this.locals) {
        if (this.session.userId) {
          this.locals.userId = this.session.userId;
        }
        return this.locals;
      }

      this.locals = {
        traceId: uuid(),
        userId: (this.session && this.session.userId) || undefined,
      };

      return this.locals;
    },
  });

  next();
});

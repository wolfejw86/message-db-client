'use strict';
require('dotenv').config();
const fastify = require('fastify');
const path = require('path');
const AutoLoad = require('fastify-autoload');
const fastifySession = require('fastify-session');
const pov = require('point-of-view');

/**
 *
 * @param {fastify.FastifyInstance} fastify
 * @param {*} opts
 */
module.exports = async function(fastify, opts) {
  // Place here your custom code!
  fastify.register(pov, {
    engine: { handlebars: require('handlebars') },
    layout: './views/layouts/main.hbs',
  });
  fastify.register(require('fastify-formbody'));
  fastify.register(require('fastify-routes'));
  fastify.register(require('fastify-cookie'));
  fastify.register(fastifySession, {
    secret: process.env.COOKIE_SECRETS.split(','),
  });

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts),
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts),
  });

  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'components'),
    options: Object.assign({}, opts),
  });

  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'denormalizers'),
    options: Object.assign({}, opts),
  });

  fastify.addHook('onReady', async () => {
    console.log(fastify.printRoutes());
  });
};

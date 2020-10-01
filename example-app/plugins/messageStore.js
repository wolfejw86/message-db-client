const pgp = require('pg-promise')();
const fp = require('fastify-plugin');
const { MessageDbClient } = require('../../dist');
/**
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
module.exports = fp(
  async (fastify, opts) => {
    const appDb = pgp(process.env.APP_PG_URI);

    /**
     * Run any new db migrations
     */
    await new Promise((resolve, reject) => {
      const dbMigrate = require('db-migrate').getInstance(true);

      dbMigrate.silence(true);
      dbMigrate.up((err, results = []) => {
        if (err) return reject(err);

        console.log(results.length);
        resolve();
      });
    });

    /**
     * set search path on message store
     */
    const messageStore = new MessageDbClient({
      dbUri: process.env.MESSAGE_STORE_PG_URI,
    });

    fastify.decorate('appDb', appDb);
    fastify.decorate('messageStore', messageStore);

    /**
     * handle graceful shutdown and disconnect from everything
     */
    fastify.addHook('onClose', async () => {
      await Promise.all([messageStore.shutdown(), appDb.$pool.end()]);
    });
  },
  { name: 'message-store' }
);

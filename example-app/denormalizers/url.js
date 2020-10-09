const fp = require('fastify-plugin');
const { MessageDbClient } = require('../../dist');

/**
 * @param {import("fastify").FastifyInstance & {messageStore: MessageDbClient}} fastify
 */
module.exports = fp(
  async function (fastify) {
    const urlDenormalizerSub = fastify.messageStore.createSubscriber(
      {
        handlers: {
          UrlCreated: async event => {
            await fastify.appDb.query(
              `
            INSERT INTO urls
              (id, redirect_to_url, user_id)
                VALUES
              ($1, $2, $3)
            ON CONFLICT DO NOTHING;

            INSERT INTO url_stats
              (url_id)
                VALUES
              ($1)
            ON CONFLICT DO NOTHING;
            `,
              [event.data.urlId, event.data.url, event.data.userId]
            );
          },
        },
        streamName: 'url',
        subscriberId: 'denormalizers:url-view',
      }
    );

    urlDenormalizerSub.start().catch(err => {
      console.log(err);
      throw err;
    });

    const urlStatsDenormalizerSub = fastify.messageStore.createSubscriber(
      {
        handlers: {
          UrlVisited: async event => {
            await fastify.appDb.query(
              `
            UPDATE url_stats
            SET stats = jsonb_set(
              jsonb_set(
                stats,
                '{visitCount}',
                ((stats->>'visitCount')::int + 1)::text::jsonb
              ),
              '{lastVisitProcessed}',
              $2::text::jsonb
            )
            WHERE url_id = $1 AND (stats->>'lastVisitProcessed')::int < $2
            `,
              [event.data.urlId, event.globalPosition]
            );
          },
        },
        streamName: 'url',
        subscriberId: 'denormalizers:url-stats',
      }
    );

    urlStatsDenormalizerSub.start().catch(err => {
      console.log(err);
      throw err;
    });

    fastify.addHook('onClose', async () => {
      await Promise.all([
        urlDenormalizerSub.stop(),
        urlStatsDenormalizerSub.stop(),
      ]);
    });
  },
  { dependencies: ['message-store'] }
);

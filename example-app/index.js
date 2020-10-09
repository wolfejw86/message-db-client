const fastify = require('fastify');

const server = fastify({
  trustProxy: true,
  pluginTimeout: 120 * 1000,
});

server.register(require('./app'));

server.listen(3000, '0.0.0.0', err => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }

  server.log.info(
    `App is running on port ${port} @ ${new Date().toISOString()}`,
  );
});
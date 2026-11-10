const server = require('../server');

if (require.main === module) {
  server.startServer().catch((error) => {
    console.error('Unable to start server:', error.message);
    process.exitCode = 1;
  });
}

module.exports = server;
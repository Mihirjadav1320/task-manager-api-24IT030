const { test } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');

test('GET /health should return HTTP 200 and healthy status', async () => {
  const server = app.listen(0);

  try {
    const address = server.address();

    const response = await fetch(
      `http://127.0.0.1:${address.port}/health`
    );

    const data = await response.json();

    assert.equal(response.status, 200);

    // Intentionally incorrect expectation to demonstrate CI failure
    assert.equal(data.status, 'OK');
    assert.equal(
      data.message,
      'Task Manager API is running'
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
});


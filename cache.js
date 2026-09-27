const NodeCache = require('node-cache');

// stdTTL: 60 matlab har cached item 60 second baad automatically expire ho jayega
const cache = new NodeCache({ stdTTL: 60 });

module.exports = cache;
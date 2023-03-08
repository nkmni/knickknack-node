const blake2 = require('blake2');

function hash(str) {
  const hash = blake2.createHash('blake2s');
  hash.update(Buffer.from(str));
  const hashHex = hash.digest('hex');

  return hashHex;
}

module.exports = { hash };
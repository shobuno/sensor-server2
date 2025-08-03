// sensor-server/backend/tools/hash-password.js
const bcrypt = require('bcryptjs');

const plainPassword = 'abc';

bcrypt.hash(plainPassword, 10).then((hash) => {
  // console.log('✅ ハッシュ:', hash);
});

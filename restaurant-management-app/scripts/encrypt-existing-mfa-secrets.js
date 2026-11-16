require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { encryptSecret } = require('../lib/mfa');
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: { mfaSecret: { not: null } },
    select: { id: true, mfaSecret: true }
  });
  let count = 0;
  for (const u of users) {
    if (u.mfaSecret.startsWith('v1:')) continue; // already encrypted
    await prisma.user.update({ where: { id: u.id }, data: { mfaSecret: encryptSecret(u.mfaSecret) } });
    count++;
  }
  console.log(`Encrypted ${count} plaintext MFA secret(s).`);
  await prisma.$disconnect();
})();
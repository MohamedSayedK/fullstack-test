import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: { username: 'alice', password: await hash('password123') },
  });

  await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: { username: 'bob', password: await hash('password456') },
  });

  console.log('Seeded users: alice / password123, bob / password456');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

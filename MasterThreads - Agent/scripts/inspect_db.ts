import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.category.findMany({
    include: { products: true },
  });
  console.log('=== CATEGORIES IN DB ===');
  console.log(categories.map(c => ({ name: c.name, productCount: c.products.length })));

  const posts = await prisma.threadsPost.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      authorUsername: true,
      content: true,
      userTags: true,
      userNotes: true,
      publishedAt: true,
    }
  });
  console.log('\n=== RECENT POSTS IN DB ===');
  for (const p of posts) {
    console.log(`\n[@${p.authorUsername}]: ${p.content?.slice(0, 100)}...`);
    console.log(`Tags: ${p.userTags}`);
    console.log(`Notes: ${p.userNotes}`);
  }
}

main().finally(() => prisma.$disconnect());

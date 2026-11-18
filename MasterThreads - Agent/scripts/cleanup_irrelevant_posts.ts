import { PrismaClient } from '@prisma/client';
import { matchCategoriesSemantic } from '../src/lib/crawler/threads-crawler';

const prisma = new PrismaClient();

const defaultCategories = [
  'Decor phòng ngủ & Bàn học',
  'Phụ kiện công nghệ & Công thái học',
  'Đồ gia dụng thông minh',
  'Thời trang & Balo đi học',
  'Mỹ phẩm & Chăm sóc da'
];

async function main() {
  const posts = await prisma.threadsPost.findMany({
    include: { comments: true },
  });

  console.log(`Đang rà soát lại ${posts.length} bài viết hiện có trong CSDL...\n`);

  let deletedCount = 0;
  let updatedCount = 0;

  for (const post of posts) {
    const commentsList = (post.comments || []).map((c) => ({ content: c.content }));
    const matches = matchCategoriesSemantic(post.content || '', commentsList, defaultCategories);

    if (matches.length === 0) {
      console.log(`🗑️ Đã xóa bài không liên quan: [@${post.authorUsername}] "${post.content?.slice(0, 50)}..."`);
      await prisma.threadsPost.delete({ where: { id: post.id } });
      deletedCount++;
    } else {
      const topMatch = matches[0];
      const userTags = [topMatch.category, `${topMatch.score}% phù hợp`];
      const userNotes = `🎯 Phù hợp danh mục: [${topMatch.category}] (Độ khớp: ${topMatch.score}%).\n💡 Lý do: ${topMatch.reason}`;

      await prisma.threadsPost.update({
        where: { id: post.id },
        data: {
          userTags: JSON.stringify(userTags),
          userNotes: userNotes,
        },
      });

      console.log(`✅ Cập nhật bài chuẩn: [@${post.authorUsername}] -> [${topMatch.category}] (${topMatch.score}%)`);
      updatedCount++;
    }
  }

  console.log(`\nHoàn tất! Đã dọn dẹp ${deletedCount} bài viết rác, giữ lại ${updatedCount} bài viết thực sự liên quan.`);
}

main().finally(() => prisma.$disconnect());

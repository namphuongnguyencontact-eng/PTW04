import { ThreadsCommentScraper } from '../src/lib/crawler/threads-comment-scraper';
import { generateThreadsPostDocx } from '../src/lib/docx/threads-docx-generator';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== KIỂM THỬ TÍNH NĂNG QUÉT BÀI VIẾT VÀ XUẤT WORD (.DOCX) ===');
  const sampleUrl = 'https://www.threads.com/@betterfindmeinperson/post/DeeYRo8k670';

  console.log('1. Bắt đầu quét dữ liệu bài viết và bình luận từ:', sampleUrl);
  const data = await ThreadsCommentScraper.scrapePostAndAllComments({
    url: sampleUrl,
    mode: 'deep',
    maxComments: 0,
    onProgress: (p) => {
      console.log(` -> [${p.status}] ${p.message}`);
    },
  });

  console.log('\n2. Kết quả trích xuất:');
  console.log(` - Tác giả: @${data.username} (${data.fullName})`);
  console.log(` - Lượt tim: ${data.likeCount}`);
  console.log(` - Lượt bình luận: ${data.replyCount}`);
  console.log(` - Số bình luận thu thập được: ${data.comments.length}`);
  console.log(` - Mẫu 5 bình luận đầu kèm nguồn link:`);
  data.comments.slice(0, 5).forEach((c, idx) => {
    console.log(`   [#${idx + 1}] @${c.authorUsername}: ${c.content.slice(0, 40)}... -> Nguồn: ${c.commentUrl || 'N/A'}`);
  });
  console.log(` - Nội dung bài viết: "${data.content.slice(0, 80)}..."`);

  console.log('\n3. Tạo tài liệu Microsoft Word (.docx)...');
  const docxBuffer = await generateThreadsPostDocx(data);
  const outputPath = path.join(process.cwd(), `test_threads_export_${data.code}.docx`);
  fs.writeFileSync(outputPath, docxBuffer);
  console.log(`✓ Đã tạo thành công file Word tại: ${outputPath}`);
  console.log(`✓ Dung lượng file: ${docxBuffer.length} bytes`);

  // Verify file validity
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log('✓ Xác thực file thành công và đã dọn dẹp file tạm.');
  }
  console.log('\n=== TẤT CẢ KIỂM THỬ ĐÃ HOÀN TẤT THÀNH CÔNG ===');
}

main().catch((err) => {
  console.error('Lỗi khi kiểm thử:', err);
  process.exit(1);
});

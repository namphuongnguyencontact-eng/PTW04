const VN_BOUNDARY = '(?:^|[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ])';
const VN_BOUNDARY_END = '(?:[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]|$)';

export function hasVnKeyword(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  if (phrase.includes(' ')) {
    return text.toLowerCase().includes(phrase.toLowerCase());
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`${VN_BOUNDARY}${escaped}${VN_BOUNDARY_END}`, 'i');
  return reg.test(text);
}

const NOISE_PHRASES = [
  'tuyển dụng', 'tuyển gấp', 'tìm việc', 'intern', 'fresher', 'part-time', 'full-time',
  'mô tả công việc', 'nộp cv', 'apply cv', 'gửi cv', 'lương up to', 'mức lương:',
  'thực tập sinh', 'lịch thi', 'phòng thi', 'thi tốt nghiệp', 'thi thpt', 'chấm điểm',
  'điểm thi', 'thi cử', 'ôn thi đại học', 'lương ở việt nam', 'lương ở các nước',
  'kinh tế thế giới', 'tin tức thời sự', 'thất tình', 'chia tay rồi', 'cắm sừng',
  'bắt gian', 'bóc phốt ngoại tình',
];

const INTENT_GROUPS: Array<{ type: string; phrases: string[] }> = [
  {
    type: 'Mua sắm & Hỏi link',
    phrases: [
      'xin link', 'mua ở đâu', 'chỗ mua', 'chỗ bán', 'ai dùng rồi', 'ai xài rồi',
      'có nên mua', 'rcm', 'recommend', 'gợi ý cho mình', 'gợi ý giúp', 'tìm mua',
      'cần tìm', 'tư vấn giúp', 'nên mua loại nào', 'đang phân vân', 'pass lại',
      'thanh lý', 'ai pass', 'giá bao nhiêu', 'xin địa chỉ', 'link shopee', 'link bio',
      'trên shopee', 'trên tiktok', 'tiktok shop', 'săn sale', 'chốt đơn', 'đặt hàng',
      'vừa sắm', 'mới tậu', 'mới sắm', 'mới mua', 'định mua', 'tính mua', 'ngáo giá', 'tăng giá'
    ],
  },
  {
    type: 'Review & Trải nghiệm',
    phrases: [
      'review', 'đánh giá', 'unbox', 'mở hộp', 'dùng thử', 'trải nghiệm', 'chân ái',
      'cứu tinh', 'đáng tiền', 'tiền nào của nấy', 'chính hãng', 'setup góc', 'decor lại',
      'góc làm việc', 'góc học tập', 'bàn làm việc', 'đồ dùng hữu ích', 'món đồ đáng mua',
      'chất lượng tốt', 'dùng thích lắm', 'dùng cực thích', 'ưng cái bụng', 'độ hoàn thiện'
    ],
  },
  {
    type: 'Nhu cầu & Nỗi đau',
    phrases: [
      'đau lưng', 'mỏi vai gáy', 'mỏi cổ', 'gù lưng', 'cột sống', 'ngồi nhiều đau',
      'phòng trọ chật', 'bừa bộn', 'nổi mụn', 'da khô', 'da dầu', 'da nhạy cảm',
      'thâm mụn', 'mụn viêm', 'thức khuya mỏi mắt', 'chống cận', 'ẩm mốc', 'ướt balo',
      'chống nước', 'tiện lợi', 'gọn gàng'
    ],
  },
];

const CATEGORY_DOMAIN_MAP: Record<string, { aliases: string[]; terms: string[] }> = {
  decor: {
    aliases: ['decor', 'trang trí', 'nội thất', 'phòng ngủ', 'bàn học', 'góc làm việc', 'phòng trọ'],
    terms: [
      'bàn học', 'bàn làm việc', 'bàn nâng hạ', 'ghế công thái học', 'ghế gaming',
      'ghế xoay', 'đèn bàn', 'đèn học', 'đèn màn hình', 'kệ sách', 'kệ để đồ',
      'kệ treo tường', 'gương đứng', 'gương toàn thân', 'rèm cửa', 'thảm trải sàn',
      'tủ quần áo', 'setup bàn', 'setup góc', 'decor góc', 'decor phòng',
      'trang trí phòng', 'đồng hồ để bàn', 'khung tranh', 'giường ngủ', 'đệm topper',
      'nệm ngủ', 'phòng trọ', 'bàn gỗ', 'bàn trà', 'kê chân', 'giá đỡ màn hình'
    ],
  },
  tech: {
    aliases: ['công nghệ', 'phụ kiện công nghệ', 'điện tử', 'thiết bị', 'gadget'],
    terms: [
      'tai nghe bluetooth', 'tai nghe không dây', 'chuột không dây', 'chuột bluetooth',
      'chuột gaming', 'bàn phím cơ', 'bàn phím bluetooth', 'giá đỡ laptop', 'stand laptop',
      'cáp sạc', 'củ sạc', 'củ sạc nhanh', 'pin dự phòng', 'sạc dự phòng', 'laptop',
      'máy tính', 'ipad', 'màn hình rời', 'ổ cắm điện', 'kê tay bàn phím', 'lót chuột',
      'ốp lưng', 'hub chuyển đổi', 'giá đỡ ipad', 'tay cầm chơi game', 'giá treo tai nghe',
      'loa bluetooth', 'apple watch', 'đồng hồ thông minh'
    ],
  },
  ergonomic: {
    aliases: ['công thái học', 'ergonomic', 'chống gù', 'chống đau mỏi'],
    terms: [
      'ghế công thái học', 'bàn nâng hạ', 'giá đỡ laptop', 'kê tay', 'kê chân công thái học',
      'gối công thái học', 'đệm lưng', 'đau lưng', 'mỏi vai gáy', 'mỏi cổ', 'cột sống',
      'tư thế ngồi', 'chống gù', 'đèn màn hình chống mỏi mắt'
    ],
  },
  household: {
    aliases: ['gia dụng', 'đồ dùng', 'phòng trọ', 'tiện ích', 'nhà bếp', 'thông minh'],
    terms: [
      'đồ gia dụng', 'nồi chiên không dầu', 'nồi cơm điện', 'ấm siêu tốc', 'bình giữ nhiệt',
      'ly giữ nhiệt', 'máy hút bụi', 'máy hút bụi mini', 'máy sấy tóc', 'hộp cơm cắm điện',
      'kệ bát', 'bếp từ', 'quạt mini', 'quạt tích điện', 'máy lọc không khí', 'máy hút ẩm',
      'máy tạo ẩm', 'bình nước', 'hộp đựng đồ', 'móc treo quần áo', 'thùng rác thông minh',
      'máy xay sinh tố', 'chảo chống dính'
    ],
  },
  fashion: {
    aliases: ['thời trang', 'balo', 'túi xách', 'outfit', 'quần áo', 'giày dép', 'phụ kiện thời trang'],
    terms: [
      'balo đi học', 'balo laptop', 'balo chống nước', 'túi xách', 'túi tote',
      'túi đeo chéo', 'túi', 'balo', 'áo hoodie', 'áo polo', 'áo thun', 'áo khoác', 'quần jean',
      'quần ống rộng', 'giày sneaker', 'dép quai hậu', 'local brand', 'outfit đi học',
      'phối đồ', 'mũ lưỡi trai', 'ví tiền', 'áo sơ mi', 'chân váy', 'áo blazer'
    ],
  },
  skincare: {
    aliases: ['mỹ phẩm', 'chăm sóc da', 'skincare', 'làm đẹp'],
    terms: [
      'skincare', 'chăm sóc da', 'kem chống nắng', 'sữa rửa mặt', 'toner', 'serum',
      'kem dưỡng ẩm', 'trị mụn', 'da dầu mụn', 'da nhạy cảm', 'tẩy trang',
      'nước tẩy trang', 'mặt nạ dưỡng da', 'son môi', 'son dưỡng', 'chấm mụn',
      'bha', 'retinol', 'phục hồi da', 'tẩy tế bào chết', 'kem mắt'
    ],
  },
  health: {
    aliases: ['sức khỏe', 'chăm sóc cá nhân', 'thể thao'],
    terms: [
      'bàn chải điện', 'máy tăm nước', 'vitamin', 'thực phẩm chức năng', 'viên uống',
      'đau cột sống', 'đau thắt lưng', 'mỏi cổ vai gáy', 'chống cận thị', 'mỏi mắt',
      'ngủ ngon', 'tập gym', 'bình lắc gym', 'dây kháng lực', 'thảm yoga'
    ],
  },
};

export function matchCategoriesSemantic(
  content: string,
  comments: Array<{ content: string }>,
  categories: string[]
) {
  if (!categories || categories.length === 0) return [];

  const postText = (content || '').toLowerCase();
  const topCommentsText = (comments || [])
    .slice(0, 5)
    .map((c) => c.content)
    .join(' ')
    .toLowerCase();

  // 1. Noise Filter
  for (const phrase of NOISE_PHRASES) {
    if (hasVnKeyword(postText, phrase)) {
      return [];
    }
  }

  // 2. Intent Detection
  let hasIntent = false;
  const detectedIntents: string[] = [];
  for (const group of INTENT_GROUPS) {
    for (const phrase of group.phrases) {
      if (hasVnKeyword(postText, phrase) || hasVnKeyword(topCommentsText, phrase)) {
        hasIntent = true;
        if (!detectedIntents.includes(group.type)) {
          detectedIntents.push(group.type);
        }
        break;
      }
    }
  }

  const results: Array<{ category: string; score: number; reason: string }> = [];

  for (const rawCat of categories) {
    const catName = rawCat.trim();
    if (!catName) continue;
    const catLower = catName.toLowerCase();

    let score = 0;
    const reasons: string[] = [];
    const matchedTerms: string[] = [];

    // Direct match
    if (hasVnKeyword(postText, catLower)) {
      score += 55;
      reasons.push(`Nội dung nhắc trực tiếp đến danh mục "${catName}"`);
    } else if (hasVnKeyword(topCommentsText, catLower)) {
      score += 30;
      reasons.push(`Bình luận nhắc đến danh mục "${catName}"`);
    }

    // Sub-phrases
    const userCategoryPhrases = catLower
      .split(/[,&/+/]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);

    let phraseHits = 0;
    for (const phrase of userCategoryPhrases) {
      if (phrase && hasVnKeyword(postText, phrase)) {
        phraseHits++;
        score += 25;
        reasons.push(`Khớp cụm chủ đề "${phrase}"`);
      }
    }

    // Domain concepts
    for (const [domainKey, domainData] of Object.entries(CATEGORY_DOMAIN_MAP)) {
      const isRelated =
        catLower.includes(domainKey) ||
        domainData.aliases.some((alias) => catLower.includes(alias));

      if (isRelated) {
        for (const term of domainData.terms) {
          if (hasVnKeyword(postText, term)) {
            if (!matchedTerms.includes(term)) {
              matchedTerms.push(term);
              score += matchedTerms.length === 1 ? 20 : 10;
            }
          } else if (hasVnKeyword(topCommentsText, term)) {
            if (!matchedTerms.includes(term)) {
              matchedTerms.push(term);
              score += 8;
            }
          }
        }
      }
    }

    // Product intent bonus
    if (matchedTerms.length > 0 && hasIntent) {
      score += 25;
      reasons.push(`Có ngữ cảnh ${detectedIntents.slice(0, 2).join(' & ')}`);
    }

    if (matchedTerms.length > 0) {
      reasons.push(`Khớp sản phẩm/khái niệm thực tế: [${matchedTerms.slice(0, 4).join(', ')}]`);
    }

    // Must have at least 1 concrete product term or direct category match
    if (matchedTerms.length === 0 && phraseHits === 0 && !hasVnKeyword(postText, catLower)) {
      score = 0;
    }

    score = Math.min(98, score);

    if (score >= 45) {
      results.push({
        category: catName,
        score,
        reason: reasons.join('. ') || 'Phù hợp với chủ đề và nhu cầu sản phẩm.',
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

const testCategories = [
  'Decor phòng ngủ & Bàn học',
  'Phụ kiện công nghệ & Công thái học',
  'Đồ gia dụng thông minh',
  'Thời trang & Balo đi học',
  'Mỹ phẩm & Chăm sóc da'
];

const samplePosts = [
  {
    author: 'quynnhthuw',
    content: 'CÓ AI GIỐNG TUI KHÔNG ???? CHỨ TUI THẤY HAPAS DẠO NÀY CÓ HƠI NGÁO GIÁ 😭💸 Tui định mua cái túi mà nó tăng từ 350k lên 490k trong 2 tuần...',
    comments: [{ content: 'Túi shop này da nhanh bong lắm b ơi' }, { content: 'Qua shopee săn sale rẻ hơn nhiều' }]
  },
  {
    author: 'minio.sie',
    content: 'Pov: thật ra tôi không muốn thu cục squishy của HS, chỉ là tôi muốn mượn cớ để nghịch nó......',
    comments: [{ content: 'Haha cô giáo vui tính ghê' }]
  },
  {
    author: 'tls.123123',
    content: 'Toi khá ghen tị với lịch nghỉ học bên nước ngoài cuz wdym họ có spring break, summer break, winter break...',
    comments: [{ content: 'Đúng r bạn ơi, VN học suốt năm' }]
  },
  {
    author: 'ctr.uong',
    content: '[REMOTE] CONTENT ASSISTANT (INTERN/FRESHER) 📝 Tìm bạn phối hợp sản xuất nội dung TikTok/Reels...',
    comments: []
  },
  {
    author: 'setup_guy',
    content: 'Mới tậu chiếc ghế công thái học và nâng cấp lại góc làm việc phòng trọ đón năm mới 2026. Ngồi đỡ đau lưng hẳn!',
    comments: [{ content: 'Xin link ghế với b ơi' }, { content: 'Bàn nâng hạ mua ở đâu vậy ạ' }]
  },
  {
    author: 'skincare_girl',
    content: 'Da dầu mụn mùa này treatment dùng retinol bị khô rát quá, mọi người cho em xin link kem dưỡng ẩm phục hồi da tốt với ạ!',
    comments: [{ content: 'Dùng B5 La Roche Posay hoặc Klairs thử đi b' }]
  },
  {
    author: 'viranee27',
    content: 'Tôi có thắc mắc: 1. Có ông nào đã từng được người thương tặng hoa/quà, chúc mừng 19/11 chưa?',
    comments: [{ content: 'Chưa bao giờ luôn' }]
  },
  {
    author: 'vivianne_247',
    content: '1 ngày lương ở Việt Nam bằng 1 giờ lương ở các nước khác thật hả mọi người?...',
    comments: []
  },
  {
    author: 'jinwool.o',
    content: 'Tự nhiên nhớ về 50p thi vật lý ngày 12/6/2026... ở phòng thi số 4',
    comments: []
  }
];

console.log('Testing Semantic Matching Engine:\n');

for (const p of samplePosts) {
  const matches = matchCategoriesSemantic(p.content, p.comments, testCategories);
  console.log(`User @${p.author}:`);
  console.log(`Content: "${p.content.slice(0, 70)}..."`);
  if (matches.length > 0) {
    console.log(`✅ MATCHED: [${matches[0].category}] - Score: ${matches[0].score}%`);
    console.log(`   Reason: ${matches[0].reason}\n`);
  } else {
    console.log(`❌ SKIPPED: Không liên quan đến danh mục sản phẩm.\n`);
  }
}

import { prisma } from './prisma';
import { ThreadsAdapter } from './adapters/threads-adapter';
import { analyzePostById } from './ai/ai-service';

export async function seedDemoDataset(): Promise<{
  categoriesCount: number;
  productsCount: number;
  postsCount: number;
  campaignsCount: number;
}> {
  // 1. Create realistic categories
  const categoriesData = [
    {
      name: 'Đồ dùng học tập & làm việc',
      slug: 'do-dung-hoc-tap-lam-viec',
      description: 'Dụng cụ, thiết bị hỗ trợ học tập, bàn học sinh viên và làm việc tại nhà.',
      color: '#84A282',
      icon: 'BookOpen',
    },
    {
      name: 'Phụ kiện công nghệ',
      slug: 'phu-kien-cong-nghe',
      description: 'Phụ kiện máy tính, điện thoại, setup bàn làm việc công thái học.',
      color: '#6d8b6b',
      icon: 'Laptop',
    },
    {
      name: 'Đồ dùng phòng trọ & gia dụng thông minh',
      slug: 'do-dung-phong-tro',
      description: 'Giải pháp tối ưu không gian sống cho sinh viên và người thuê trọ.',
      color: '#B8CFB3',
      icon: 'Home',
    },
    {
      name: 'Chăm sóc cá nhân & Sức khỏe',
      slug: 'cham-soc-ca-nhan',
      description: 'Đồ dùng tiện ích hỗ trợ sinh hoạt hàng ngày và sức khỏe công sở.',
      color: '#F6E2E9',
      icon: 'Heart',
    },
  ];

  const createdCategories: Record<string, string> = {};

  for (const cat of categoriesData) {
    const existing = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
    createdCategories[cat.slug] = existing.id;
  }

  // 2. Create realistic affiliate products
  const productsData = [
    {
      name: 'Đèn bàn học tích điện chống cận Baseus',
      categoryId: createdCategories['do-dung-hoc-tap-lam-viec'],
      brand: 'Baseus',
      description: 'Đèn LED bảo vệ mắt có pin sạc tích điện 2000mAh, gấp gọn linh hoạt, chỉnh 3 chế độ sáng.',
      problemsSolved: JSON.stringify([
        'Thiếu ánh sáng khi học bài buổi tối',
        'Bàn học sinh viên quá nhỏ không có chỗ cắm điện cố định',
        'Cần đèn dự phòng khi phòng trọ bị mất điện',
        'Mỏi mắt do ánh sáng chập chờn hoặc đèn tuýp quá chói',
      ]),
      targetAudience: JSON.stringify([
        'Sinh viên, học sinh',
        'Người làm việc ban đêm trong phòng trọ',
        'Người hay phải di chuyển',
      ]),
      typicalSituations: JSON.stringify([
        'Học bài khuya không muốn bật đèn lớn làm phiền bạn cùng phòng',
        'Phòng trọ mất điện mùa hè',
        'Bàn học góc hẹp không có ổ cắm gần',
      ]),
      keywords: JSON.stringify([
        'đèn học',
        'đèn bàn',
        'tích điện',
        'góc học tập',
        'bảo vệ mắt',
        'bàn học',
        'phòng trọ',
        'học bài',
      ]),
      synonyms: JSON.stringify(['đèn led để bàn', 'đèn đọc sách pin sạc', 'đèn chống cận']),
      negativeKeywords: JSON.stringify(['đèn chùm', 'đèn đường', 'đèn ô tô']),
      price: 249000,
      affiliateUrl: 'https://shope.ee/demo-baseus-desk-lamp',
      originalUrl: 'https://shopee.vn/product/12345/67890',
      platform: 'Shopee',
      notes: 'Sản phẩm bán chạy mùa tựu trường, hoa hồng 8-12%.',
      status: 'ACTIVE',
    },
    {
      name: 'Giá đỡ laptop nhôm công thái học xoay 360 độ',
      categoryId: createdCategories['phu-kien-cong-nghe'],
      brand: 'Orico',
      description: 'Giá đỡ hợp kim nhôm tản nhiệt cao cấp, nâng laptop ngang tầm mắt, xoay 360 độ linh hoạt.',
      problemsSolved: JSON.stringify([
        'Đau mỏi cổ, vai gáy khi cúi đầu làm việc lâu',
        'Laptop bị nóng, quạt tản nhiệt kêu to',
        'Bàn làm việc bừa bộn, thiếu chỗ để bàn phím phụ',
      ]),
      targetAudience: JSON.stringify([
        'Dân văn phòng, lập trình viên, designer',
        'Sinh viên học online bằng laptop',
        'Người setup bàn làm việc tối giản',
      ]),
      typicalSituations: JSON.stringify([
        'Ngồi làm việc 8 tiếng/ngày bị đau lưng và gù lưng',
        'Cần mở rộng không gian mặt bàn',
      ]),
      keywords: JSON.stringify([
        'giá đỡ laptop',
        'stand laptop',
        'đau mỏi cổ',
        'cổ vai gáy',
        'tản nhiệt',
        'setup bàn',
        'công thái học',
        'laptop',
      ]),
      synonyms: JSON.stringify(['kệ để laptop', 'đế nhôm macbook', 'giá kê máy tính']),
      negativeKeywords: JSON.stringify(['sửa laptop', 'mua laptop cũ']),
      price: 189000,
      affiliateUrl: 'https://shope.ee/demo-laptop-stand',
      originalUrl: 'https://shopee.vn/product/34567/89012',
      platform: 'Shopee',
      notes: 'Tỷ lệ chuyển đổi rất cao cho bài viết than vãn đau mỏi cổ vai gáy.',
      status: 'ACTIVE',
    },
    {
      name: 'Kệ sách & để đồ mini 2 tầng để bàn học',
      categoryId: createdCategories['do-dung-phong-tro'],
      brand: 'DecorHome',
      description: 'Kệ gỗ lắp ghép thông minh 2 tầng, tối ưu không gian chứa sách vở, mỹ phẩm, đồ trang trí.',
      problemsSolved: JSON.stringify([
        'Bàn học quá chật chội, sách vở và mỹ phẩm để lộn xộn',
        'Phòng trọ diện tích nhỏ không thể kê thêm tủ lớn',
        'Mất thời gian dọn đồ mỗi lần ngồi học',
      ]),
      targetAudience: JSON.stringify([
        'Sinh viên ở kí túc xá, phòng trọ',
        'Các bạn nữ nhiều mỹ phẩm và đồ skincare',
      ]),
      typicalSituations: JSON.stringify([
        'Mỗi lần học bài phải dọn dẹp mất 15-20 phút',
        'Cần decor phòng trọ gọn gàng, ấm cúng',
      ]),
      keywords: JSON.stringify([
        'kệ mini',
        'kệ để bàn',
        'bàn chật',
        'bừa bộn',
        'tối ưu không gian',
        'phòng trọ',
        'decor phòng',
        'góc học tập',
      ]),
      synonyms: JSON.stringify(['kệ lắp ghép 2 tầng', 'giá để sách mini', 'kệ decor bàn']),
      negativeKeywords: JSON.stringify(['tủ quần áo 4 cánh', 'bán nhà']),
      price: 85000,
      affiliateUrl: 'https://shope.ee/demo-mini-desk-shelf',
      originalUrl: 'https://shopee.vn/product/56789/01234',
      platform: 'Shopee',
      notes: 'Giá rẻ, sinh viên ra quyết định mua nhanh.',
      status: 'ACTIVE',
    },
    {
      name: 'Bàn phím cơ không dây Bluetooth đa thiết bị',
      categoryId: createdCategories['phu-kien-cong-nghe'],
      brand: 'AULA',
      description: 'Bàn phím cơ 75 phím gõ êm mượt, kết nối 3 thiết bị cùng lúc (PC, Mac, iPad), pin sạc dùng 1 tháng.',
      problemsSolved: JSON.stringify([
        'Bàn phím laptop gõ cấn tay, phím nông gây mỏi ngón tay',
        'Dây nhợ bàn phím vướng víu trên mặt bàn nhỏ',
        'Cần gõ văn bản nhanh trên cả iPad và máy tính',
      ]),
      targetAudience: JSON.stringify([
        'Dân văn phòng, content creator, sinh viên',
        'Người thích setup góc làm việc clean, không dây',
      ]),
      typicalSituations: JSON.stringify([
        'Gõ bài tiểu luận hoặc làm báo cáo dài hạn chế mỏi tay',
        'Mang đi học, đi làm cà phê',
      ]),
      keywords: JSON.stringify([
        'bàn phím cơ',
        'không dây',
        'bluetooth',
        'gõ êm',
        'mỏi tay',
        'setup bàn',
        'ipad',
        'bàn làm việc',
      ]),
      synonyms: JSON.stringify(['keyboard không dây', 'bàn phím bluetooth', 'bàn phím silent']),
      negativeKeywords: JSON.stringify(['bàn phím điện thoại', 'hỏng màn hình']),
      price: 499000,
      affiliateUrl: 'https://shope.ee/demo-wireless-keyboard',
      originalUrl: 'https://shopee.vn/product/78901/23456',
      platform: 'TikTok Shop',
      notes: 'Được các reviewer Threads nhắc đến liên tục.',
      status: 'ACTIVE',
    },
    {
      name: 'Bình giữ nhiệt Inox 316 hiển thị nhiệt độ 800ml',
      categoryId: createdCategories['cham-soc-ca-nhan'],
      brand: 'Lock&Lock Style',
      description: 'Bình giữ nhiệt 2 lớp inox 316 y tế cao cấp, nắp cảm ứng báo nhiệt độ, giữ nóng/lạnh 24h.',
      problemsSolved: JSON.stringify([
        'Ngại uống nước khi ngồi làm việc lâu',
        'Nước đá nhanh tan làm ướt mặt bàn hoặc sách vở',
        'Cần nước ấm buổi sáng hoặc trà/cà phê giữ lạnh cả ngày',
      ]),
      targetAudience: JSON.stringify([
        'Dân văn phòng, sinh viên lên giảng đường',
        'Người tập gym, hoạt động ngoài trời',
      ]),
      typicalSituations: JSON.stringify([
        'Ngồi văn phòng máy lạnh cả ngày da khô khát nước',
        'Pha cà phê mang đi làm tiết kiệm tiền',
      ]),
      keywords: JSON.stringify([
        'bình giữ nhiệt',
        'uống nước',
        'inox 316',
        'văn phòng',
        'máy lạnh',
        'nước ấm',
        'giữ lạnh',
        'tiết kiệm',
      ]),
      synonyms: JSON.stringify(['ly giữ nhiệt', 'bình nước giữ nhiệt mini', 'tumbler']),
      negativeKeywords: JSON.stringify(['bình nóng lạnh gia đình', 'bình gas']),
      price: 159000,
      affiliateUrl: 'https://shope.ee/demo-thermos-flask',
      originalUrl: 'https://shopee.vn/product/90123/45678',
      platform: 'Shopee',
      notes: 'Mặt hàng evergreen, bán quanh năm.',
      status: 'ACTIVE',
    },
  ];

  for (const prod of productsData) {
    const existing = await prisma.product.findFirst({
      where: { name: prod.name },
    });
    if (!existing) {
      await prisma.product.create({ data: prod });
    }
  }

  // 3. Create Scan Campaign
  const campaign = await prisma.scanCampaign.upsert({
    where: { id: 'camp_sinhvien_demo' },
    update: {
      status: 'COMPLETED',
      collectedCount: 4,
      validCount: 4,
      analyzedCount: 4,
    },
    create: {
      id: 'camp_sinhvien_demo',
      name: 'Tìm cơ hội affiliate đồ dùng sinh viên & phòng trọ',
      topic: 'Cuộc sống sinh viên, phòng trọ, góc học tập, công thái học',
      mainKeywords: JSON.stringify([
        'phòng trọ',
        'góc học tập',
        'setup bàn',
        'đau mỏi cổ',
        'chật hẹp',
      ]),
      secondaryKeywords: JSON.stringify([
        'sinh viên',
        'bàn học',
        'đèn học',
        'laptop',
        'đau lưng',
      ]),
      language: 'vi',
      targetPostsCount: 20,
      minEngagement: 50,
      targetCategoryIds: JSON.stringify(Object.values(createdCategories)),
      status: 'COMPLETED',
      collectedCount: 4,
      validCount: 4,
      analyzedCount: 4,
      startedAt: new Date(Date.now() - 3600 * 1000 * 2),
      completedAt: new Date(),
    },
  });

  // 4. Create sample realistic Threads posts with genuine Vietnamese text & comments from real Threads posts
  const samplePosts = [
    {
      threadsPostId: 'DZUxJQyE-MI',
      postUrl: 'https://www.threads.com/@_nostalgias.ciara/post/DZUxJQyE-MI',
      authorUsername: '_nostalgias.ciara',
      authorName: 'Ciara',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ciara',
      content:
        'Muốn kiếm trọ ở Hải Phòng mà tìm toàn mấy trọ nhìn cũ cũ thôi. Giờ biết kiếm phòng ở đâu đây mn. Mà tìm phòng trọ có ban công, setup bàn học thoáng đãng khó ghê.',
      publishedAt: new Date(Date.now() - 3600 * 1000 * 5),
      likesCount: 29,
      repliesCount: 54,
      repostsCount: 3,
      quotesCount: 1,
      viewsCount: 1200,
      source: 'DEMO_SEED' as const,
      campaignId: campaign.id,
      comments: [
        {
          authorUsername: 'huyngoc15',
          content: 'Về kcn nhà trọ mới luôn bạn ơi, phòng rộng rãi sạch sẽ.',
          likesCount: 5,
        },
        {
          authorUsername: 'meiiiii15th2',
          content: 'Khu gần trường đại học nhiều phòng mới xây lắm đó b.',
          likesCount: 3,
        },
      ],
    },
    {
      threadsPostId: 'DbF4cafkSPi',
      postUrl: 'https://www.threads.com/@therealest_tiny/post/DbF4cafkSPi',
      authorUsername: 'therealest_tiny',
      authorName: 'Tiny',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tiny',
      content:
        'Hôm qua đi kiếm trọ. Thấy một phòng giá 2tr5/tháng, mình mừng muốn khóc vì tưởng nhặt được kèo thơm. Đến nơi phòng trọ chật hẹp, bàn làm việc phải kê sát giường, đèn vàng vè mờ căm. Đang tính sắm cái giá đỡ laptop nâng cao tầm mắt với cái đèn led chống cận cứu vãn.',
      publishedAt: new Date(Date.now() - 3600 * 1000 * 14),
      likesCount: 133,
      repliesCount: 57,
      repostsCount: 12,
      quotesCount: 4,
      viewsCount: 8500,
      source: 'DEMO_SEED' as const,
      campaignId: campaign.id,
      comments: [
        {
          authorUsername: 'hoang.coder',
          content: 'Chuẩn luôn chị ơi, em mua cái stand laptop nhôm có 100 mấy k mà cải thiện 80% vụ đau mỏi cổ vai gáy, khuyên thật lòng ai dùng laptop cũng phải có.',
          likesCount: 42,
        },
        {
          authorUsername: 'quynh.chi',
          content: 'Đèn bàn học thì cứ tìm loại đèn led tích điện Baseus ấy, gấp gọn được, hết điện vẫn dùng được 4-5 tiếng học khuya.',
          likesCount: 19,
        },
      ],
    },
    {
      threadsPostId: 'DeB8NnHGKZc',
      postUrl: 'https://www.threads.com/@ok320218/post/DeB8NnHGKZc',
      authorUsername: 'ok320218',
      authorName: 'OK',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ok',
      content:
        'ai có bàn học bàn làm việc 100x50 hoặc 120x60 ới em với ạ, cần loại chắc chắn để vừa laptop với màn hình phụ decor phòng trọ gọn gàng.',
      publishedAt: new Date(Date.now() - 3600 * 1000 * 20),
      likesCount: 2,
      repliesCount: 9,
      repostsCount: 0,
      quotesCount: 0,
      viewsCount: 300,
      source: 'DEMO_SEED' as const,
      campaignId: campaign.id,
      comments: [
        {
          authorUsername: 'mai.anh',
          content: 'Mua bàn chân sắt mặt gỗ trên Shopee ấy b, tầm 200-300k bao chắc.',
          likesCount: 4,
        },
      ],
    },
    {
      threadsPostId: 'DdY91u7CYJC',
      postUrl: 'https://www.threads.com/@h.limh6587/post/DdY91u7CYJC',
      authorUsername: 'h.limh6587',
      authorName: 'Locladi123',
      authorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=loc',
      content:
        'Phòng trọ 2tr8 không chung chủ. Anh em nào mới chuyển trọ cần setup lại không gian bàn học, giá treo đồ thông minh thì tham khảo nhé.',
      publishedAt: new Date(Date.now() - 3600 * 1000 * 8),
      likesCount: 21,
      repliesCount: 11,
      repostsCount: 1,
      quotesCount: 0,
      viewsCount: 950,
      source: 'DEMO_SEED' as const,
      campaignId: campaign.id,
      comments: [
        {
          authorUsername: 'cafecaugiay',
          content: 'Phòng này ở khu vực nào thế bạn ơi?',
          likesCount: 2,
        },
      ],
    },
  ];

  // Ingest each post and run the AI analysis pipeline
  let createdPostsCount = 0;
  for (const postData of samplePosts) {
    const { post } = await ThreadsAdapter.ingestAndSavePost(postData);
    // Trigger analysis
    await analyzePostById({ postId: post.id, forceProvider: 'local' });
    createdPostsCount++;
  }

  return {
    categoriesCount: Object.keys(createdCategories).length,
    productsCount: productsData.length,
    postsCount: createdPostsCount,
    campaignsCount: 1,
  };
}

export async function resetDemoDataset(): Promise<{ success: boolean; message: string }> {
  // Cleanly remove demo data (posts where source is DEMO_SEED, and sample campaign)
  const demoPosts = await prisma.threadsPost.findMany({
    where: { source: 'DEMO_SEED' },
    select: { id: true },
  });

  const demoPostIds = demoPosts.map((p) => p.id);

  if (demoPostIds.length > 0) {
    await prisma.productMatch.deleteMany({
      where: { postId: { in: demoPostIds } },
    });
    await prisma.postAnalysis.deleteMany({
      where: { postId: { in: demoPostIds } },
    });
    await prisma.postComment.deleteMany({
      where: { postId: { in: demoPostIds } },
    });
    await prisma.postMetricsSnapshot.deleteMany({
      where: { postId: { in: demoPostIds } },
    });
    await prisma.threadsPost.deleteMany({
      where: { id: { in: demoPostIds } },
    });
  }

  await prisma.scanCampaign.deleteMany({
    where: { id: 'camp_sinhvien_demo' },
  });

  return {
    success: true,
    message: `Đã dọn dẹp ${demoPostIds.length} bài viết và chiến dịch mẫu thành công.`,
  };
}

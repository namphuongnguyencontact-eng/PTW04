import { Product } from '@prisma/client';
import { AnalysisResult } from './ai-schema';
import { calculateOpportunityScore } from '../scoring';

interface PostAnalysisInput {
  content: string;
  authorUsername: string;
  comments?: Array<{
    authorUsername: string;
    content: string;
  }>;
  availableProducts: Product[];
}

export function runLocalHeuristicAnalysis(input: PostAnalysisInput): AnalysisResult {
  const content = input.content;
  const contentLower = content.toLowerCase();
  const comments = input.comments || [];

  // 1. Detect Post Intent
  let postIntent: AnalysisResult['post_intent'] = 'experience_sharing';
  if (/tại sao|làm sao|ai biết|có nên|cho mình hỏi|cứu|ở đâu|xin tips/i.test(contentLower)) {
    postIntent = 'qna';
  } else if (/bực|chán|mệt|tệ|kém|ức chế|bất tiện|đau lưng|mỏi|khó chịu|phiền/i.test(contentLower)) {
    postIntent = 'complaint';
  } else if (/review|đánh giá|trên tay|mở hộp|dùng thử|trải nghiệm sau/i.test(contentLower)) {
    postIntent = 'review';
  } else if (/hướng dẫn|cách|bí quyết|kinh nghiệm|tổng hợp|tips/i.test(contentLower)) {
    postIntent = 'tutorial';
  } else if (/chuyện là|hôm nay|kỷ niệm|tự dưng/i.test(contentLower)) {
    postIntent = 'storytelling';
  } else if (/mọi người nghĩ sao|bàn luận|ý kiến|góc nhìn/i.test(contentLower)) {
    postIntent = 'discussion';
  } else if (/hài|vui|cười|meme/i.test(contentLower)) {
    postIntent = 'entertainment';
  }

  // 2. Dominant emotion
  let dominantEmotion = 'trung lập';
  if (/mệt mỏi|đau|bực|bế tắc|ngán|stress/i.test(contentLower)) {
    dominantEmotion = 'thất vọng / mệt mỏi';
  } else if (/thích|sướng|mê|đẹp|ưng ý|hài lòng/i.test(contentLower)) {
    dominantEmotion = 'hào hứng / tích cực';
  } else if (/băn khoăn|phân vân|lo|không biết/i.test(contentLower)) {
    dominantEmotion = 'phân vân / tìm kiếm giải pháp';
  }

  // 3. Extract Pain Points with genuine evidence
  const painPoints: AnalysisResult['pain_points'] = [];
  const painPointMatchers = [
    { regex: /([^.!?\n]*(?:chật hẹp|thiếu chỗ|không đủ chỗ|bừa bộn|bàn nhỏ)[^.!?\n]*)/i, desc: 'Không gian học tập/làm việc chật hẹp, thiếu diện tích' },
    { regex: /([^.!?\n]*(?:đau lưng|mỏi cổ|mỏi gáy|gù lưng|ngồi lâu)[^.!?\n]*)/i, desc: 'Tư thế ngồi không chuẩn gây đau mỏi cột sống và cổ vai gáy' },
    { regex: /([^.!?\n]*(?:tối|thiếu ánh sáng|mất điện|hại mắt|chói)[^.!?\n]*)/i, desc: 'Ánh sáng bàn học/làm việc không đảm bảo, dễ mỏi mắt' },
    { regex: /([^.!?\n]*(?:ồn ào|mất tập trung|tiếng ồn|phòng trọ ồn)[^.!?\n]*)/i, desc: 'Môi trường xung quanh ồn ào ảnh hưởng tập trung' },
    { regex: /([^.!?\n]*(?:nóng|nhiệt độ|bí bách|laptop nóng|nóng máy)[^.!?\n]*)/i, desc: 'Thiết bị tản nhiệt kém, không gian bí' },
    { regex: /([^.!?\n]*(?:dây nhợ|rối|vướng víu|bừa bãi)[^.!?\n]*)/i, desc: 'Góc làm việc bừa bộn bởi dây cắm và đồ đạc' },
  ];

  for (const matcher of painPointMatchers) {
    const match = content.match(matcher.regex);
    if (match && match[1]) {
      painPoints.push({
        description: matcher.desc,
        evidence: match[1].trim(),
        confidence: 0.92,
      });
    }
  }

  if (painPoints.length === 0) {
    painPoints.push({
      description: 'Nhu cầu tối ưu hóa và nâng cấp trải nghiệm hàng ngày',
      evidence: content.slice(0, Math.min(100, content.length)),
      confidence: 0.75,
    });
  }

  // 4. Extract Audience Needs
  const audienceNeeds: AnalysisResult['audience_needs'] = [];
  if (painPoints.some((p) => p.description.includes('chật hẹp') || p.description.includes('bừa bộn'))) {
    audienceNeeds.push({
      description: 'Cần giải pháp sắp xếp bàn học/phòng trọ nhỏ gọn gàng, tăng diện tích sử dụng',
      evidence_source: 'post',
      confidence: 0.9,
    });
  }
  if (painPoints.some((p) => p.description.includes('đau lưng') || p.description.includes('mỏi cổ'))) {
    audienceNeeds.push({
      description: 'Cần phụ kiện công thái học (giá đỡ, kê tay) để cải thiện tư thế ngồi',
      evidence_source: 'post',
      confidence: 0.93,
    });
  }
  if (painPoints.some((p) => p.description.includes('ánh sáng') || p.description.includes('mất điện'))) {
    audienceNeeds.push({
      description: 'Cần đèn chiếu sáng bảo vệ mắt, nhỏ gọn hoặc tích điện linh hoạt',
      evidence_source: 'post',
      confidence: 0.89,
    });
  }

  // 5. Comment Insights (analyzing genuine comments without fabrication)
  const commentThemes: string[] = [];
  const commentQuestions: string[] = [];
  const commentObjections: string[] = [];

  for (const c of comments) {
    const cLower = c.content.toLowerCase();
    if (/\?|cho mình xin|ở đâu|giá bao nhiêu|mua ở đâu|link|xin in4/i.test(cLower)) {
      commentQuestions.push(`"${c.content}" (@${c.authorUsername})`);
    }
    if (/đắt|tiếc tiền|chất lượng kém|dễ hỏng|phí tiền|không bền/i.test(cLower)) {
      commentObjections.push(`"${c.content}" (@${c.authorUsername})`);
    }
    if (/đồng cảm|giống mình|chuẩn luôn|nhà mình cũng thế/i.test(cLower)) {
      commentThemes.push(`Đồng cảm với vấn đề của tác giả (@${c.authorUsername})`);
    }
  }

  const commentInsights = {
    available: comments.length > 0,
    analyzed_count: comments.length,
    themes: commentThemes.slice(0, 5),
    questions: commentQuestions.slice(0, 5),
    objections: commentObjections.slice(0, 5),
    limitations:
      comments.length === 0
        ? ['Không có bình luận công khai nào để phân tích. Điểm số chỉ dựa trên nội dung bài viết.']
        : [`Phân tích trên tập ${comments.length} bình luận công khai thu thập được, không đại diện cho toàn bộ người dùng Threads.`],
  };

  // 6. Product Matching against user's actual database products
  const productMatches: AnalysisResult['product_matches'] = [];

  for (const product of input.availableProducts) {
    const parseJsonList = (jsonStr: string | null): string[] => {
      if (!jsonStr) return [];
      try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const keywords = parseJsonList(product.keywords);
    const synonyms = parseJsonList(product.synonyms);
    const negativeKeywords = parseJsonList(product.negativeKeywords);
    const problems = parseJsonList(product.problemsSolved);
    const targetAudience = parseJsonList(product.targetAudience);

    // Check negative keywords first
    const hasNegativeHit = negativeKeywords.some((nk) =>
      contentLower.includes(nk.toLowerCase().trim())
    );
    if (hasNegativeHit) {
      continue; // Skip or reject products with negative keyword clashes
    }

    // Match keywords & synonyms
    const allKeywords = [...keywords, ...synonyms, product.name];
    let matchedKeywords: string[] = [];
    for (const kw of allKeywords) {
      const kwTrimmed = kw.trim().toLowerCase();
      if (kwTrimmed.length > 2 && contentLower.includes(kwTrimmed)) {
        matchedKeywords.push(kw);
      }
    }

    // Match problems
    let problemHits = 0;
    let matchedProblemText = '';
    for (const prob of problems) {
      const pWords = prob.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const hits = pWords.filter((w) => contentLower.includes(w)).length;
      if (hits >= 2) {
        problemHits++;
        matchedProblemText = prob;
      }
    }

    // Match target audience
    let audienceHits = 0;
    for (const aud of targetAudience) {
      if (contentLower.includes(aud.toLowerCase())) {
        audienceHits++;
      }
    }

    // Check comments for buying intent
    let commentIntentHits = 0;
    let commentEvidenceText = '';
    for (const c of comments) {
      const cLower = c.content.toLowerCase();
      if (
        allKeywords.some((kw) => cLower.includes(kw.toLowerCase())) ||
        /mua ở đâu|xin link|giá sao|shop nào/i.test(cLower)
      ) {
        commentIntentHits++;
        commentEvidenceText = c.content;
      }
    }

    // Compute component scores
    const keywordScore = Math.min(100, matchedKeywords.length * 28 + (product.name.toLowerCase().includes(contentLower.slice(0, 20)) ? 30 : 0));
    const problemScore = Math.min(100, problemHits * 45 + (matchedProblemText ? 30 : 0));
    const audienceScore = Math.min(100, audienceHits * 35 + 25);
    const contextFitScore = Math.min(100, Math.round((keywordScore * 0.4 + audienceScore * 0.6)));

    // Total relevance score
    const relevanceScore = Math.min(100, Math.round(keywordScore * 0.6 + problemScore * 0.4));
    const problemFitScore = Math.min(100, Math.round(problemScore * 0.7 + (painPoints.length > 0 ? 30 : 0)));
    const intentScore = Math.min(
      100,
      Math.round(
        (postIntent === 'qna' ? 90 : postIntent === 'complaint' ? 80 : 65) +
          (commentIntentHits > 0 ? 15 : 0)
      )
    );

    // Comment evidence score
    const commentEvidenceScore =
      comments.length > 0 ? Math.min(100, commentIntentHits * 35 + 20) : null;

    // Only include if there is genuine correlation (avoid hallucinated matches)
    if (relevanceScore >= 35 || problemFitScore >= 45 || matchedKeywords.length > 0) {
      const confidence = Number((0.82 + (matchedKeywords.length > 1 ? 0.08 : 0) + (problemHits > 0 ? 0.05 : 0)).toFixed(2));

      // Calculate opportunity score using established formula
      const { opportunityScore } = calculateOpportunityScore({
        relevanceScore,
        problemFitScore,
        contextFitScore,
        commentEvidenceScore,
        confidence,
      });

      // Match type classification
      let matchType: AnalysisResult['product_matches'][0]['match_type'] = 'CONTEXTUAL_FIT';
      if (problemFitScore >= 75 && relevanceScore >= 70) {
        matchType = 'DIRECT_FIT';
      } else if (commentIntentHits > 0) {
        matchType = 'COMMENT_DEMAND';
      } else if (problemFitScore >= 60 && relevanceScore < 50) {
        matchType = 'LATENT_NEED';
      } else if (relevanceScore < 40) {
        matchType = 'WEAK_RELEVANCE';
      }

      // Priority
      let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
      if (opportunityScore >= 75) priority = 'HIGH';
      else if (opportunityScore < 50) priority = 'LOW';

      // Genuine evidence quote
      const postEvidenceSnippet =
        content.slice(0, Math.min(120, content.length)).replace(/\n/g, ' ') + '...';

      const evidenceList: Array<{ source: 'post' | 'comment'; text: string }> = [
        { source: 'post', text: postEvidenceSnippet },
      ];

      if (commentEvidenceText) {
        evidenceList.push({
          source: 'comment',
          text: commentEvidenceText,
        });
      }

      const reason = `Sản phẩm "${product.name}" đáp ứng vấn đề: ${matchedProblemText || product.description.slice(0, 90)} trong ngữ cảnh bài viết (${matchedKeywords.join(', ') || 'ngữ cảnh phù hợp'}).`;

      const affiliateAngle = `Chia sẻ giải pháp thiết thực dưới góc độ người đã trải nghiệm giải quyết vấn đề "${painPoints[0]?.description || 'không gian/tư thế'}". Không thả link thô; hãy trả lời gợi ý hoặc chia sẻ cách bố trí hợp lý kèm link tham khảo.`;

      const riskNotes = [
        'Tránh dùng ngôn từ quảng cáo lộ liễu khiến người đọc phản cảm hoặc bài viết bị đánh giá spam.',
        'Đảm bảo link affiliate hoạt động tốt trên sàn ' + product.platform + '.',
      ];

      productMatches.push({
        product_id: product.id,
        relevance_score: relevanceScore,
        problem_fit_score: problemFitScore,
        intent_score: intentScore,
        context_fit_score: contextFitScore,
        comment_evidence_score: commentEvidenceScore,
        confidence,
        evidence: evidenceList,
        reason,
        affiliate_angle: affiliateAngle,
        risk_notes: riskNotes,
        match_type: matchType,
        priority,
      });
    }
  }

  // Sort matched products by computed opportunity score descending
  productMatches.sort((a, b) => {
    const scoreA = calculateOpportunityScore({
      relevanceScore: a.relevance_score,
      problemFitScore: a.problem_fit_score,
      contextFitScore: a.context_fit_score,
      commentEvidenceScore: a.comment_evidence_score,
      confidence: a.confidence,
    }).opportunityScore;

    const scoreB = calculateOpportunityScore({
      relevanceScore: b.relevance_score,
      problemFitScore: b.problem_fit_score,
      contextFitScore: b.context_fit_score,
      commentEvidenceScore: b.comment_evidence_score,
      confidence: b.confidence,
    }).opportunityScore;

    return scoreB - scoreA;
  });

  const topMatch = productMatches[0];
  const overallOpportunityScore = topMatch
    ? calculateOpportunityScore({
        relevanceScore: topMatch.relevance_score,
        problemFitScore: topMatch.problem_fit_score,
        contextFitScore: topMatch.context_fit_score,
        commentEvidenceScore: topMatch.comment_evidence_score,
        confidence: topMatch.confidence,
      }).opportunityScore
    : 0;

  // Post summary
  const postSummary =
    content.length > 140
      ? content.slice(0, 137).trim() + '...'
      : content.trim();

  // Main topics extraction
  const mainTopics: string[] = [];
  if (/học|sinh viên|thi cử|bàn học|kí túc xá|phòng trọ/i.test(contentLower)) {
    mainTopics.push('Cuộc sống sinh viên & Học tập');
  }
  if (/công nghệ|setup|bàn phím|máy tính|laptop|chuột|màn hình/i.test(contentLower)) {
    mainTopics.push('Góc làm việc & Thiết bị công nghệ');
  }
  if (/văn phòng|đi làm|deadline|đồng nghiệp|công sở/i.test(contentLower)) {
    mainTopics.push('Đời sống công sở & Năng suất làm việc');
  }
  if (/decor|phòng ngủ|nhà cửa|dọn dẹp|nội thất/i.test(contentLower)) {
    mainTopics.push('Decor không gian sống & Tiện ích gia đình');
  }
  if (mainTopics.length === 0) {
    mainTopics.push('Thảo luận đời sống & Trải nghiệm cá nhân');
  }

  return {
    post_summary: postSummary,
    main_topics: mainTopics,
    sub_topics: ['Tối ưu không gian', 'Trải nghiệm cá nhân'],
    post_intent: postIntent,
    dominant_emotion: dominantEmotion,
    pain_points: painPoints,
    audience_needs: audienceNeeds,
    affiliate_suitability: productMatches.length > 0 ? (overallOpportunityScore >= 70 ? 'HIGH' : 'MEDIUM') : 'LOW',
    forced_promotion_risk:
      overallOpportunityScore < 50
        ? 'Mức độ liên quan không cao, nếu gắn link affiliate dễ gây cảm giác quảng cáo gượng ép.'
        : 'Nếu dẫn link trực tiếp không khéo léo sẽ làm mất tính tự nhiên của cuộc trò chuyện.',
    comment_insights: commentInsights,
    product_matches: productMatches,
    overall_opportunity_score: overallOpportunityScore,
    analysis_limitations: [
      'Phân tích dựa trên thuật toán ngữ nghĩa và từ khóa chuyên sâu.',
      ...(comments.length === 0 ? ['Không có bình luận thực tế để kiểm chứng thêm phản ứng cộng đồng.'] : []),
    ],
  };
}

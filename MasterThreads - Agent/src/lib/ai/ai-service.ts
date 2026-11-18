import { prisma } from '../prisma';
import { AnalysisResult, AnalysisResultSchema } from './ai-schema';
import { runLocalHeuristicAnalysis } from './local-analyzer';
import { calculateOpportunityScore } from '../scoring';

interface AnalyzePostOptions {
  postId: string;
  forceProvider?: 'gemini' | 'openai' | 'local';
}

export async function analyzePostById(options: AnalyzePostOptions): Promise<AnalysisResult> {
  const post = await prisma.threadsPost.findUnique({
    where: { id: options.postId },
    include: {
      comments: true,
      campaign: true,
    },
  });

  if (!post) {
    throw new Error(`Post with ID ${options.postId} not found.`);
  }

  // Load active products from database
  let availableProducts = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    include: { category: true },
  });

  // Filter by campaign categories if specified
  if (post.campaign?.targetCategoryIds) {
    try {
      const targetCatIds: string[] = JSON.parse(post.campaign.targetCategoryIds);
      if (Array.isArray(targetCatIds) && targetCatIds.length > 0) {
        const filtered = availableProducts.filter((p) =>
          targetCatIds.includes(p.categoryId)
        );
        if (filtered.length > 0) {
          availableProducts = filtered;
        }
      }
    } catch {
      // Keep all active products
    }
  }

  // Check system settings for AI provider
  const providerSetting = await prisma.appSetting.findUnique({
    where: { key: 'ai_provider' },
  });
  const geminiKeySetting = await prisma.appSetting.findUnique({
    where: { key: 'gemini_api_key' },
  });
  const openaiKeySetting = await prisma.appSetting.findUnique({
    where: { key: 'openai_api_key' },
  });

  const provider =
    options.forceProvider ||
    providerSetting?.value ||
    process.env.AI_PROVIDER ||
    'local';
  const geminiKey = geminiKeySetting?.value || process.env.GEMINI_API_KEY || '';
  const openaiKey = openaiKeySetting?.value || process.env.OPENAI_API_KEY || '';

  let analysisResult: AnalysisResult;

  if (provider === 'gemini' && geminiKey) {
    try {
      analysisResult = await callGeminiProvider({
        apiKey: geminiKey,
        content: post.content,
        authorUsername: post.authorUsername,
        comments: post.comments.map((c) => ({
          authorUsername: c.authorUsername,
          content: c.content,
        })),
        availableProducts,
      });
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local analyzer:', err);
      analysisResult = runLocalHeuristicAnalysis({
        content: post.content,
        authorUsername: post.authorUsername,
        comments: post.comments.map((c) => ({
          authorUsername: c.authorUsername,
          content: c.content,
        })),
        availableProducts,
      });
    }
  } else if (provider === 'openai' && openaiKey) {
    try {
      analysisResult = await callOpenAIProvider({
        apiKey: openaiKey,
        content: post.content,
        authorUsername: post.authorUsername,
        comments: post.comments.map((c) => ({
          authorUsername: c.authorUsername,
          content: c.content,
        })),
        availableProducts,
      });
    } catch (err) {
      console.warn('OpenAI API call failed, falling back to local analyzer:', err);
      analysisResult = runLocalHeuristicAnalysis({
        content: post.content,
        authorUsername: post.authorUsername,
        comments: post.comments.map((c) => ({
          authorUsername: c.authorUsername,
          content: c.content,
        })),
        availableProducts,
      });
    }
  } else {
    // Local NLP analyzer
    analysisResult = runLocalHeuristicAnalysis({
      content: post.content,
      authorUsername: post.authorUsername,
      comments: post.comments.map((c) => ({
        authorUsername: c.authorUsername,
        content: c.content,
      })),
      availableProducts,
    });
  }

  // Validate that all product_matches exist in availableProducts
  const validProductIds = new Set(availableProducts.map((p) => p.id));
  analysisResult.product_matches = analysisResult.product_matches.filter((m) =>
    validProductIds.has(m.product_id)
  );

  // Re-verify opportunity scores for mathematical consistency
  for (const match of analysisResult.product_matches) {
    const calc = calculateOpportunityScore({
      relevanceScore: match.relevance_score,
      problemFitScore: match.problem_fit_score,
      contextFitScore: match.context_fit_score,
      commentEvidenceScore: match.comment_evidence_score,
      confidence: match.confidence,
    });
    // Set official opportunity score
    match.relevance_score = calc.normalizedBreakdown.relevance;
    match.problem_fit_score = calc.normalizedBreakdown.problemFit;
    match.context_fit_score = calc.normalizedBreakdown.contextFit;
  }

  // Save to database
  const topMatch = analysisResult.product_matches[0];
  const maxOpportunityScore = topMatch
    ? calculateOpportunityScore({
        relevanceScore: topMatch.relevance_score,
        problemFitScore: topMatch.problem_fit_score,
        contextFitScore: topMatch.context_fit_score,
        commentEvidenceScore: topMatch.comment_evidence_score,
        confidence: topMatch.confidence,
      }).opportunityScore
    : 0;

  await prisma.$transaction(async (tx) => {
    // 1. Delete old matches & analysis for this post if re-analyzing
    await tx.productMatch.deleteMany({ where: { postId: post.id } });
    await tx.postAnalysis.deleteMany({ where: { postId: post.id } });

    // 2. Create PostAnalysis
    await tx.postAnalysis.create({
      data: {
        postId: post.id,
        postSummary: analysisResult.post_summary,
        mainTopics: JSON.stringify(analysisResult.main_topics),
        subTopics: JSON.stringify(analysisResult.sub_topics || []),
        postIntent: analysisResult.post_intent,
        painPoints: JSON.stringify(analysisResult.pain_points),
        audienceNeeds: JSON.stringify(analysisResult.audience_needs),
        dominantEmotion: analysisResult.dominant_emotion,
        affiliateSuitability: analysisResult.affiliate_suitability,
        forcedPromotionRisk: analysisResult.forced_promotion_risk,
        commentInsightsAvailable: analysisResult.comment_insights.available,
        commentAnalyzedCount: analysisResult.comment_insights.analyzed_count,
        commentThemes: JSON.stringify(analysisResult.comment_insights.themes),
        commentQuestions: JSON.stringify(analysisResult.comment_insights.questions),
        commentObjections: JSON.stringify(analysisResult.comment_insights.objections),
        commentLimitations: JSON.stringify(analysisResult.comment_insights.limitations),
        overallOpportunityScore: maxOpportunityScore,
        analysisLimitations: JSON.stringify(analysisResult.analysis_limitations),
      },
    });

    // 3. Create ProductMatches
    for (const match of analysisResult.product_matches) {
      const matchScore = calculateOpportunityScore({
        relevanceScore: match.relevance_score,
        problemFitScore: match.problem_fit_score,
        contextFitScore: match.context_fit_score,
        commentEvidenceScore: match.comment_evidence_score,
        confidence: match.confidence,
      }).opportunityScore;

      await tx.productMatch.create({
        data: {
          postId: post.id,
          productId: match.product_id,
          relevanceScore: match.relevance_score,
          problemFitScore: match.problem_fit_score,
          intentScore: match.intent_score,
          contextFitScore: match.context_fit_score,
          commentEvidenceScore: match.comment_evidence_score,
          confidence: match.confidence,
          opportunityScore: matchScore,
          matchType: match.match_type,
          reason: match.reason,
          evidence: JSON.stringify(match.evidence),
          affiliateAngle: match.affiliate_angle,
          riskNotes: JSON.stringify(match.risk_notes),
          priority: match.priority,
        },
      });
    }

    // 4. Update post status
    await tx.threadsPost.update({
      where: { id: post.id },
      data: {
        analysisStatus: 'ANALYZED',
        maxOpportunityScore,
      },
    });
  });

  return analysisResult;
}

async function callGeminiProvider(params: {
  apiKey: string;
  content: string;
  authorUsername: string;
  comments: Array<{ authorUsername: string; content: string }>;
  availableProducts: any[];
}): Promise<AnalysisResult> {
  const productCatalogText = params.availableProducts
    .map(
      (p) =>
        `- ID: ${p.id} | Name: ${p.name} | Category: ${p.category?.name || 'General'} | Description: ${p.description} | Problems: ${p.problemsSolved || ''} | Keywords: ${p.keywords || ''}`
    )
    .join('\n');

  const commentsText =
    params.comments.length > 0
      ? params.comments
          .map((c) => `@${c.authorUsername}: ${c.content}`)
          .join('\n')
      : 'Không có bình luận';

  const prompt = `Bạn là hệ thống AI phân tích nội dung Threads và đối chiếu sản phẩm affiliate chuyên nghiệp.
Nhiệm vụ: Phân tích bài viết Threads và các bình luận dưới đây, đối chiếu với danh mục sản phẩm của người dùng và trả về JSON theo schema quy định.

DANH MỤC SẢN PHẨM KHẢ DỤNG:
${productCatalogText}

BÀI VIẾT THREADS:
Tác giả: @${params.authorUsername}
Nội dung:
"""
${params.content}
"""

BÌNH LUẬN CÔNG KHAI:
${commentsText}

QUY TẮC BẮT BUỘC:
1. Chỉ sử dụng product_id thực tế có trong danh mục sản phẩm phía trên. Không tự bịa ID.
2. Trích dẫn bằng chứng (evidence) phải là trích đoạn thực tế từ bài viết hoặc bình luận. Không bịa bằng chứng.
3. Nếu không có sản phẩm nào phù hợp, mảng product_matches để rỗng [].
4. Trả về đúng định dạng JSON hợp lệ tuân theo schema.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${params.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  const parsed = JSON.parse(text);
  return AnalysisResultSchema.parse(parsed);
}

async function callOpenAIProvider(params: {
  apiKey: string;
  content: string;
  authorUsername: string;
  comments: Array<{ authorUsername: string; content: string }>;
  availableProducts: any[];
}): Promise<AnalysisResult> {
  const productCatalogText = params.availableProducts
    .map(
      (p) =>
        `- ID: ${p.id} | Name: ${p.name} | Category: ${p.category?.name || 'General'} | Description: ${p.description} | Problems: ${p.problemsSolved || ''} | Keywords: ${p.keywords || ''}`
    )
    .join('\n');

  const commentsText =
    params.comments.length > 0
      ? params.comments
          .map((c) => `@${c.authorUsername}: ${c.content}`)
          .join('\n')
      : 'Không có bình luận';

  const systemMessage = `Bạn là chuyên gia AI phân tích Social Listening và Affiliate Marketing. Hãy phân tích bài viết Threads và đối chiếu với danh mục sản phẩm được cung cấp. Luôn trả về định dạng JSON hợp lệ theo schema. Không bịa ID sản phẩm.`;

  const userMessage = `DANH MỤC SẢN PHẨM KHẢ DỤNG:
${productCatalogText}

BÀI VIẾT:
@${params.authorUsername}: ${params.content}

BÌNH LUẬN:
${commentsText}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(rawContent);
  return AnalysisResultSchema.parse(parsed);
}

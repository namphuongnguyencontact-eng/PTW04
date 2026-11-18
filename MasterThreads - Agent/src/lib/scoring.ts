import { ViralClassification } from '../types';

export interface PostMetricsInput {
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  quotesCount: number;
  viewsCount?: number | null;
  publishedAt: Date | string;
}

export interface ViralScoreResult {
  engagementCount: number;
  engagementRate: number | null;
  viralScore: number;
  viralClassification: ViralClassification;
  viralExplanation: string;
  velocityPerHour: number;
  ageHours: number;
}

export function calculateEngagement(
  likes: number,
  replies: number,
  reposts: number,
  quotes: number
): number {
  return (
    Math.max(0, likes || 0) +
    Math.max(0, replies || 0) +
    Math.max(0, reposts || 0) +
    Math.max(0, quotes || 0)
  );
}

export function calculateViralScore(
  metrics: PostMetricsInput,
  referenceMaxEngagement = 5000
): ViralScoreResult {
  const engagementCount = calculateEngagement(
    metrics.likesCount,
    metrics.repliesCount,
    metrics.repostsCount,
    metrics.quotesCount
  );

  const engagementRate =
    metrics.viewsCount && metrics.viewsCount > 0
      ? Number(((engagementCount / metrics.viewsCount) * 100).toFixed(2))
      : null;

  const publishedDate = new Date(metrics.publishedAt);
  const now = new Date();
  const diffMs = Math.max(1, now.getTime() - publishedDate.getTime());
  const ageHours = Math.max(0.5, diffMs / (1000 * 60 * 60));

  const velocityPerHour = Number((engagementCount / ageHours).toFixed(2));

  // 1. Volume Score (0 - 45 points)
  // Logarithmic scaling to avoid extreme domination of mega-influencers
  const logVolume = Math.log10(engagementCount + 1);
  const maxLog = Math.log10(referenceMaxEngagement + 1);
  const volumeScore = Math.min(45, (logVolume / maxLog) * 45);

  // 2. Velocity Score (0 - 35 points)
  // Higher velocity in first 48 hours indicates viral breakout
  const logVelocity = Math.log10(velocityPerHour + 1);
  const velocityScore = Math.min(35, (logVelocity / 2.5) * 35);

  // 3. Freshness / Decay adjustment (0 - 20 points)
  // Fresh posts (< 24h) with good velocity receive higher boost
  let freshnessScore = 0;
  if (ageHours <= 24) {
    freshnessScore = 20;
  } else if (ageHours <= 72) {
    freshnessScore = 15;
  } else if (ageHours <= 168) { // 1 week
    freshnessScore = 10;
  } else {
    freshnessScore = Math.max(2, 8 - Math.log2(ageHours / 168));
  }

  const rawScore = volumeScore + velocityScore + freshnessScore;
  const viralScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  // Classification
  let viralClassification: ViralClassification = 'LOW_ENGAGEMENT';
  let viralExplanation = '';

  if (viralScore >= 80) {
    viralClassification = 'VIRAL_SUPERIOR';
    viralExplanation = `Độ lan truyền xuất sắc: Tích lũy ${engagementCount.toLocaleString()} tương tác với tốc độ cao ~${velocityPerHour} lượt/h trong ${Math.round(ageHours)}h qua.`;
  } else if (viralScore >= 60) {
    viralClassification = 'HIGH_ENGAGEMENT';
    viralExplanation = `Tương tác cao: Đạt ${engagementCount.toLocaleString()} tương tác ổn định, mức độ thảo luận tích cực.`;
  } else if (viralScore >= 40) {
    viralClassification = 'GROWING';
    viralExplanation = `Đang có dấu hiệu tăng trưởng: Tốc độ thảo luận đang tăng (~${velocityPerHour} tương tác/giờ).`;
  } else if (viralScore >= 20) {
    viralClassification = 'POTENTIAL';
    viralExplanation = `Tiềm năng nhưng chưa đủ dữ liệu: Tương tác mức trung bình, cần theo dõi thêm biến động.`;
  } else {
    viralClassification = 'LOW_ENGAGEMENT';
    viralExplanation = `Tương tác thấp: Lượng phản hồi chưa đủ ngưỡng lan truyền đáng kể.`;
  }

  return {
    engagementCount,
    engagementRate,
    viralScore,
    viralClassification,
    viralExplanation,
    velocityPerHour,
    ageHours: Number(ageHours.toFixed(1)),
  };
}

export interface OpportunityScoreInput {
  relevanceScore: number;       // 0 - 100
  problemFitScore: number;      // 0 - 100
  intentScore?: number;         // 0 - 100
  contextFitScore: number;      // 0 - 100
  commentEvidenceScore?: number | null; // 0 - 100 or null
  confidence?: number;          // 0 - 1 (default 0.85)
}

export interface OpportunityWeights {
  relevanceWeight: number; // default 0.35
  problemFitWeight: number; // default 0.25
  contextFitWeight: number; // default 0.20
  commentWeight: number; // default 0.10
  confidenceWeight: number; // default 0.10
}

export const DEFAULT_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
  relevanceWeight: 0.35,
  problemFitWeight: 0.25,
  contextFitWeight: 0.20,
  commentWeight: 0.10,
  confidenceWeight: 0.10,
};

export function calculateOpportunityScore(
  input: OpportunityScoreInput,
  customWeights?: Partial<OpportunityWeights>
): {
  opportunityScore: number;
  normalizedBreakdown: {
    relevance: number;
    problemFit: number;
    contextFit: number;
    commentEvidence: number | null;
    confidence: number;
  };
  hasCommentData: boolean;
} {
  const weights = { ...DEFAULT_OPPORTUNITY_WEIGHTS, ...customWeights };
  const confidencePercent = (input.confidence ?? 0.85) * 100;
  const hasCommentData =
    input.commentEvidenceScore !== null &&
    input.commentEvidenceScore !== undefined;

  let totalWeight = 1.0;
  let weightedSum = 0;

  if (hasCommentData) {
    weightedSum =
      input.relevanceScore * weights.relevanceWeight +
      input.problemFitScore * weights.problemFitWeight +
      input.contextFitScore * weights.contextFitWeight +
      (input.commentEvidenceScore || 0) * weights.commentWeight +
      confidencePercent * weights.confidenceWeight;
  } else {
    // If comment evidence is absent, dynamically normalize across available components
    // without inventing fake evidence (Prompt Chức năng D Bước 6).
    const availableWeight =
      weights.relevanceWeight +
      weights.problemFitWeight +
      weights.contextFitWeight +
      weights.confidenceWeight;

    const baseSum =
      input.relevanceScore * weights.relevanceWeight +
      input.problemFitScore * weights.problemFitWeight +
      input.contextFitScore * weights.contextFitWeight +
      confidencePercent * weights.confidenceWeight;

    weightedSum = baseSum / availableWeight;
  }

  const opportunityScore = Math.round(
    Math.min(100, Math.max(0, weightedSum))
  );

  return {
    opportunityScore,
    normalizedBreakdown: {
      relevance: Math.round(input.relevanceScore),
      problemFit: Math.round(input.problemFitScore),
      contextFit: Math.round(input.contextFitScore),
      commentEvidence: hasCommentData
        ? Math.round(input.commentEvidenceScore!)
        : null,
      confidence: Math.round(confidencePercent),
    },
    hasCommentData,
  };
}

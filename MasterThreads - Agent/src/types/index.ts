export type ViralClassification =
  | 'VIRAL_SUPERIOR'
  | 'HIGH_ENGAGEMENT'
  | 'GROWING'
  | 'POTENTIAL'
  | 'LOW_ENGAGEMENT';

export type ProductMatchType =
  | 'DIRECT_FIT'
  | 'CONTEXTUAL_FIT'
  | 'LATENT_NEED'
  | 'COMMENT_DEMAND'
  | 'WEAK_RELEVANCE'
  | 'UNSUITABLE';

export type PostIntent =
  | 'experience_sharing'
  | 'qna'
  | 'complaint'
  | 'storytelling'
  | 'review'
  | 'tutorial'
  | 'discussion'
  | 'entertainment';

export type AffiliateSuitability = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUITABLE';

export type CampaignStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'NOT_CONFIGURED';

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    products: number;
  };
}

export interface ProductDTO {
  id: string;
  name: string;
  categoryId: string;
  category?: CategoryDTO;
  brand?: string | null;
  description: string;
  problemsSolved?: string[];
  targetAudience?: string[];
  typicalSituations?: string[];
  keywords?: string[];
  synonyms?: string[];
  negativeKeywords?: string[];
  price?: number | null;
  affiliateUrl?: string | null;
  originalUrl?: string | null;
  platform: string;
  notes?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PostCommentDTO {
  id: string;
  postId: string;
  commentId?: string | null;
  authorUsername: string;
  content: string;
  likesCount: number;
  publishedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface PainPointItem {
  description: string;
  evidence: string;
  confidence: number;
}

export interface AudienceNeedItem {
  description: string;
  evidence_source: 'post' | 'comment';
  confidence: number;
}

export interface ProductMatchDTO {
  id?: string;
  productId: string;
  product?: ProductDTO;
  relevanceScore: number;
  problemFitScore: number;
  intentScore: number;
  contextFitScore: number;
  commentEvidenceScore: number | null;
  confidence: number;
  opportunityScore: number;
  matchType: ProductMatchType;
  reason: string;
  evidence: Array<{ source: 'post' | 'comment'; text: string }>;
  affiliateAngle: string;
  riskNotes: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PostAnalysisDTO {
  id?: string;
  postId: string;
  postSummary: string;
  mainTopics: string[];
  subTopics?: string[];
  postIntent: PostIntent;
  painPoints: PainPointItem[];
  audienceNeeds: AudienceNeedItem[];
  dominantEmotion?: string | null;
  affiliateSuitability: AffiliateSuitability;
  forcedPromotionRisk?: string | null;
  commentInsightsAvailable: boolean;
  commentAnalyzedCount: number;
  commentThemes?: string[];
  commentQuestions?: string[];
  commentObjections?: string[];
  commentLimitations?: string[];
  overallOpportunityScore: number;
  analysisLimitations?: string[];
  productMatches?: ProductMatchDTO[];
  analyzedAt: Date | string;
}

export interface ThreadsPostDTO {
  id: string;
  threadsPostId: string;
  postUrl: string;
  authorUsername: string;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  content: string;
  publishedAt: Date | string;
  source: 'API' | 'MANUAL_URL' | 'CSV_IMPORT' | 'DEMO_SEED';
  campaignId?: string | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  quotesCount: number;
  viewsCount?: number | null;
  engagementCount: number;
  engagementRate?: number | null;
  viralScore: number;
  viralClassification: ViralClassification;
  viralExplanation?: string | null;
  analysisStatus: 'UNANALYZED' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  maxOpportunityScore: number;
  isSaved: boolean;
  isDismissed: boolean;
  userNotes?: string | null;
  userTags?: string[];
  userStatus: 'NEW' | 'RESEARCHED' | 'EXPLOITED' | 'DISMISSED';
  actualConversionNotes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  comments?: PostCommentDTO[];
  analysis?: PostAnalysisDTO | null;
  productMatches?: ProductMatchDTO[];
}

export interface ScanCampaignDTO {
  id: string;
  name: string;
  topic: string;
  mainKeywords?: string[];
  secondaryKeywords?: string[];
  language: string;
  dateRange?: string | null;
  targetPostsCount: number;
  minEngagement: number;
  targetCategoryIds?: string[];
  status: CampaignStatus;
  collectedCount: number;
  validCount: number;
  analyzedCount: number;
  errorCount: number;
  errorMessage?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    posts: number;
  };
}

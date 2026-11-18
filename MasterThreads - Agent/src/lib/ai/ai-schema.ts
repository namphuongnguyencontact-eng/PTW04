import { z } from 'zod';

export const PainPointSchema = z.object({
  description: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
});

export const AudienceNeedSchema = z.object({
  description: z.string(),
  evidence_source: z.enum(['post', 'comment']),
  confidence: z.number().min(0).max(1),
});

export const ProductMatchItemSchema = z.object({
  product_id: z.string(),
  relevance_score: z.number().min(0).max(100),
  problem_fit_score: z.number().min(0).max(100),
  intent_score: z.number().min(0).max(100),
  context_fit_score: z.number().min(0).max(100),
  comment_evidence_score: z.number().min(0).max(100).nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(
    z.object({
      source: z.enum(['post', 'comment']),
      text: z.string(),
    })
  ),
  reason: z.string(),
  affiliate_angle: z.string(),
  risk_notes: z.array(z.string()).default([]),
  match_type: z
    .enum([
      'DIRECT_FIT',
      'CONTEXTUAL_FIT',
      'LATENT_NEED',
      'COMMENT_DEMAND',
      'WEAK_RELEVANCE',
      'UNSUITABLE',
    ])
    .default('CONTEXTUAL_FIT'),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
});

export const CommentInsightsSchema = z.object({
  available: z.boolean(),
  analyzed_count: z.number(),
  themes: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export const AnalysisResultSchema = z.object({
  post_summary: z.string(),
  main_topics: z.array(z.string()),
  sub_topics: z.array(z.string()).default([]),
  post_intent: z.enum([
    'experience_sharing',
    'qna',
    'complaint',
    'storytelling',
    'review',
    'tutorial',
    'discussion',
    'entertainment',
  ]),
  dominant_emotion: z.string().default('neutral'),
  pain_points: z.array(PainPointSchema).default([]),
  audience_needs: z.array(AudienceNeedSchema).default([]),
  affiliate_suitability: z
    .enum(['HIGH', 'MEDIUM', 'LOW', 'UNSUITABLE'])
    .default('MEDIUM'),
  forced_promotion_risk: z.string().nullable().optional(),
  comment_insights: CommentInsightsSchema,
  product_matches: z.array(ProductMatchItemSchema).default([]),
  overall_opportunity_score: z.number().min(0).max(100),
  analysis_limitations: z.array(z.string()).default([]),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

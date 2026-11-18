import test from 'node:test';
import assert from 'node:assert/strict';

// Test implementation of scoring directly to verify math and constraints
function calculateEngagement(likes, replies, reposts, quotes) {
  return (
    Math.max(0, likes || 0) +
    Math.max(0, replies || 0) +
    Math.max(0, reposts || 0) +
    Math.max(0, quotes || 0)
  );
}

function calculateViralScore(metrics, referenceMaxEngagement = 5000) {
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

  const logVolume = Math.log10(engagementCount + 1);
  const maxLog = Math.log10(referenceMaxEngagement + 1);
  const volumeScore = Math.min(45, (logVolume / maxLog) * 45);

  const logVelocity = Math.log10(velocityPerHour + 1);
  const velocityScore = Math.min(35, (logVelocity / 2.5) * 35);

  let freshnessScore = 0;
  if (ageHours <= 24) {
    freshnessScore = 20;
  } else if (ageHours <= 72) {
    freshnessScore = 15;
  } else if (ageHours <= 168) {
    freshnessScore = 10;
  } else {
    freshnessScore = Math.max(2, 8 - Math.log2(ageHours / 168));
  }

  const rawScore = volumeScore + velocityScore + freshnessScore;
  const viralScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  let viralClassification = 'LOW_ENGAGEMENT';
  if (viralScore >= 80) viralClassification = 'VIRAL_SUPERIOR';
  else if (viralScore >= 60) viralClassification = 'HIGH_ENGAGEMENT';
  else if (viralScore >= 40) viralClassification = 'GROWING';
  else if (viralScore >= 20) viralClassification = 'POTENTIAL';

  return {
    engagementCount,
    engagementRate,
    viralScore,
    viralClassification,
    velocityPerHour,
    ageHours,
  };
}

function calculateOpportunityScore(input, customWeights) {
  const weights = {
    relevanceWeight: 0.35,
    problemFitWeight: 0.25,
    contextFitWeight: 0.20,
    commentWeight: 0.10,
    confidenceWeight: 0.10,
    ...customWeights,
  };
  const confidencePercent = (input.confidence ?? 0.85) * 100;
  const hasCommentData =
    input.commentEvidenceScore !== null &&
    input.commentEvidenceScore !== undefined;

  let weightedSum = 0;

  if (hasCommentData) {
    weightedSum =
      input.relevanceScore * weights.relevanceWeight +
      input.problemFitScore * weights.problemFitWeight +
      input.contextFitScore * weights.contextFitWeight +
      (input.commentEvidenceScore || 0) * weights.commentWeight +
      confidencePercent * weights.confidenceWeight;
  } else {
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
    hasCommentData,
  };
}

test('calculateEngagement correctly sums distinct interaction metrics', () => {
  const count = calculateEngagement(150, 45, 20, 5);
  assert.equal(count, 220);
});

test('calculateViralScore classifies viral posts correctly', () => {
  const result = calculateViralScore({
    likesCount: 2500,
    repliesCount: 450,
    repostsCount: 300,
    quotesCount: 50,
    viewsCount: 50000,
    publishedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // 4h ago
  });

  assert.ok(result.viralScore >= 75, `Viral score should be high, got ${result.viralScore}`);
  assert.equal(result.engagementCount, 3300);
  assert.equal(result.engagementRate, 6.6); // 3300 / 50000 * 100
  assert.ok(['VIRAL_SUPERIOR', 'HIGH_ENGAGEMENT'].includes(result.viralClassification));
});

test('calculateOpportunityScore normalizes correctly when comments are absent', () => {
  const withoutComments = calculateOpportunityScore({
    relevanceScore: 90,
    problemFitScore: 85,
    contextFitScore: 80,
    commentEvidenceScore: null,
    confidence: 0.9,
  });

  assert.equal(withoutComments.hasCommentData, false);
  assert.ok(withoutComments.opportunityScore >= 80 && withoutComments.opportunityScore <= 95);

  const withComments = calculateOpportunityScore({
    relevanceScore: 90,
    problemFitScore: 85,
    contextFitScore: 80,
    commentEvidenceScore: 95,
    confidence: 0.9,
  });

  assert.equal(withComments.hasCommentData, true);
  assert.ok(withComments.opportunityScore >= 80 && withComments.opportunityScore <= 95);
});

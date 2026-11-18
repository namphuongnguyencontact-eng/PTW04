import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ThreadsAdapter } from '@/lib/adapters/threads-adapter';
import { DEFAULT_OPPORTUNITY_WEIGHTS } from '@/lib/scoring';

export async function GET(request: NextRequest) {
  try {
    const settingsList = await prisma.appSetting.findMany();
    const settingsMap = new Map(settingsList.map((s) => [s.key, s.value]));

    // Check Meta Threads connection
    const threadsStatus = await ThreadsAdapter.checkConnection();

    // Mask sensitive keys when returning to frontend
    const maskKey = (val?: string) => {
      if (!val || val.length < 8) return val ? '••••••••' : '';
      return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
    };

    const aiProvider =
      settingsMap.get('ai_provider') || process.env.AI_PROVIDER || 'local';
    const geminiKey =
      settingsMap.get('gemini_api_key') || process.env.GEMINI_API_KEY || '';
    const openaiKey =
      settingsMap.get('openai_api_key') || process.env.OPENAI_API_KEY || '';
    const anthropicKey =
      settingsMap.get('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || '';

    // Load custom weights if configured
    let weights = DEFAULT_OPPORTUNITY_WEIGHTS;
    const storedWeights = settingsMap.get('opportunity_weights');
    if (storedWeights) {
      try {
        weights = { ...DEFAULT_OPPORTUNITY_WEIGHTS, ...JSON.parse(storedWeights) };
      } catch {}
    }

    const aiConfig = {
      provider: aiProvider,
      geminiConfigured: Boolean(geminiKey),
      geminiKeyMasked: maskKey(geminiKey),
      openaiConfigured: Boolean(openaiKey),
      openaiKeyMasked: maskKey(openaiKey),
      anthropicConfigured: Boolean(anthropicKey),
      anthropicKeyMasked: maskKey(anthropicKey),
      modelName: settingsMap.get('ai_model_name') || 'gemini-1.5-flash',
      maxBatchPosts: Number(settingsMap.get('ai_max_batch_posts') || '20'),
      maxCommentsPerPost: Number(settingsMap.get('ai_max_comments') || '15'),
      analyzeCommentsEnabled:
        settingsMap.get('ai_analyze_comments') !== 'false',
      weights,
    };

    return NextResponse.json({
      success: true,
      data: {
        threadsConnection: threadsStatus,
        aiConfig,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const upsertSetting = async (key: string, value: string) => {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    };

    if (body.ai_provider !== undefined) {
      await upsertSetting('ai_provider', body.ai_provider);
    }
    if (body.gemini_api_key && !body.gemini_api_key.includes('••••')) {
      await upsertSetting('gemini_api_key', body.gemini_api_key.trim());
    }
    if (body.openai_api_key && !body.openai_api_key.includes('••••')) {
      await upsertSetting('openai_api_key', body.openai_api_key.trim());
    }
    if (body.anthropic_api_key && !body.anthropic_api_key.includes('••••')) {
      await upsertSetting('anthropic_api_key', body.anthropic_api_key.trim());
    }
    if (body.ai_model_name !== undefined) {
      await upsertSetting('ai_model_name', body.ai_model_name);
    }
    if (body.ai_max_batch_posts !== undefined) {
      await upsertSetting('ai_max_batch_posts', String(body.ai_max_batch_posts));
    }
    if (body.ai_max_comments !== undefined) {
      await upsertSetting('ai_max_comments', String(body.ai_max_comments));
    }
    if (body.ai_analyze_comments !== undefined) {
      await upsertSetting('ai_analyze_comments', String(body.ai_analyze_comments));
    }
    if (body.weights !== undefined) {
      await upsertSetting('opportunity_weights', JSON.stringify(body.weights));
    }

    // Threads API settings
    if (body.threads_access_token && !body.threads_access_token.includes('••••')) {
      await upsertSetting('threads_access_token', body.threads_access_token.trim());
    }
    if (body.threads_app_id !== undefined) {
      await upsertSetting('threads_app_id', body.threads_app_id.trim());
    }
    if (body.threads_user_id !== undefined) {
      await upsertSetting('threads_user_id', body.threads_user_id.trim());
    }

    return NextResponse.json({
      success: true,
      message: 'Cài đặt đã được lưu thành công trên máy chủ.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdatePostUserMetaSchema = z.object({
  isSaved: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
  userNotes: z.string().nullable().optional(),
  userTags: z.array(z.string()).optional(),
  userStatus: z
    .enum(['NEW', 'RESEARCHED', 'EXPLOITED', 'DISMISSED'])
    .optional(),
  actualConversionNotes: z.string().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = await prisma.threadsPost.findUnique({
      where: { id },
      include: {
        campaign: true,
        comments: {
          orderBy: { likesCount: 'desc' },
        },
        analysis: true,
        productMatches: {
          include: {
            product: {
              include: { category: true },
            },
          },
          orderBy: { opportunityScore: 'desc' },
        },
        snapshots: {
          orderBy: { capturedAt: 'asc' },
        },
      },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy bài viết' },
        { status: 404 }
      );
    }

    const parseJson = (s: string | null) => {
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    const formatted = {
      ...post,
      userTags: parseJson(post.userTags) || [],
      analysis: post.analysis
        ? {
            ...post.analysis,
            mainTopics: parseJson(post.analysis.mainTopics) || [],
            subTopics: parseJson(post.analysis.subTopics) || [],
            painPoints: parseJson(post.analysis.painPoints) || [],
            audienceNeeds: parseJson(post.analysis.audienceNeeds) || [],
            commentThemes: parseJson(post.analysis.commentThemes) || [],
            commentQuestions: parseJson(post.analysis.commentQuestions) || [],
            commentObjections: parseJson(post.analysis.commentObjections) || [],
            commentLimitations: parseJson(post.analysis.commentLimitations) || [],
            analysisLimitations: parseJson(post.analysis.analysisLimitations) || [],
          }
        : null,
      productMatches: post.productMatches.map((m) => ({
        ...m,
        evidence: parseJson(m.evidence) || [],
        riskNotes: parseJson(m.riskNotes) || [],
      })),
    };

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = UpdatePostUserMetaSchema.parse(body);

    const updateData: any = {};
    if (validated.isSaved !== undefined) updateData.isSaved = validated.isSaved;
    if (validated.isDismissed !== undefined) updateData.isDismissed = validated.isDismissed;
    if (validated.userNotes !== undefined) updateData.userNotes = validated.userNotes;
    if (validated.userStatus !== undefined) updateData.userStatus = validated.userStatus;
    if (validated.actualConversionNotes !== undefined)
      updateData.actualConversionNotes = validated.actualConversionNotes;
    if (validated.userTags !== undefined)
      updateData.userTags = JSON.stringify(validated.userTags);

    const updated = await prisma.threadsPost.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.threadsPost.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã xóa bài viết' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

let liveFeedProcess: any = null;

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json().catch(() => ({ action: 'start' }));

    if (action === 'stop') {
      if (liveFeedProcess) {
        liveFeedProcess.kill();
        liveFeedProcess = null;
        return NextResponse.json({ success: true, message: 'Đã đóng cửa sổ quét Newfeed.' });
      }
      return NextResponse.json({ success: true, message: 'Không có cửa sổ nào đang chạy.' });
    }

    // Check if already running
    if (liveFeedProcess && !liveFeedProcess.killed) {
      return NextResponse.json({
        success: true,
        message: 'Cửa sổ Chrome quét Newfeed đang hoạt động trên màn hình.',
        isRunning: true,
      });
    }

    // Launch visible Chrome process
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'live_feed_crawler.ts');
    liveFeedProcess = spawn('npx', ['tsx', scriptPath], {
      cwd: process.cwd(),
      shell: true,
      detached: false,
      stdio: 'pipe',
    });

    liveFeedProcess.on('exit', () => {
      liveFeedProcess = null;
    });

    return NextResponse.json({
      success: true,
      message: 'Đã mở cửa sổ Chrome trực quan truy cập https://www.threads.com/!',
      isRunning: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khởi chạy cửa sổ Chrome' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    isRunning: Boolean(liveFeedProcess && !liveFeedProcess.killed),
  });
}

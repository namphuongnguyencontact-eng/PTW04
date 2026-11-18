import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ThreadsCrawler } from '@/lib/crawler/threads-crawler';

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'threads_account' },
    });

    if (setting && setting.value) {
      try {
        const account = JSON.parse(setting.value);
        return NextResponse.json({
          success: true,
          account,
        });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      account: { isLoggedIn: false },
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
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'logout') {
      await prisma.appSetting.deleteMany({
        where: { key: 'threads_account' },
      });
      return NextResponse.json({ success: true, message: 'Đã hủy lưu phiên đăng nhập.' });
    }

    // Launch visible Chrome for Step 1 Login
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (event: string, data: any) => {
      try {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(payload));
      } catch {}
    };

    (async () => {
      try {
        await sendEvent('status', {
          message: '🚀 Đang mở cửa sổ trình duyệt Chrome để bạn đăng nhập Threads...',
        });

        const result = await ThreadsCrawler.openLoginSession(async (msg: string) => {
          await sendEvent('status', { message: msg });
        });

        if (result.success) {
          // Save account to DB
          const accountData = {
            isLoggedIn: true,
            username: result.username || 'threads_user',
            savedAt: new Date().toISOString(),
          };

          await prisma.appSetting.upsert({
            where: { key: 'threads_account' },
            create: {
              key: 'threads_account',
              value: JSON.stringify(accountData),
            },
            update: {
              value: JSON.stringify(accountData),
            },
          });

          await sendEvent('login_success', {
            account: accountData,
            message: `🎉 Đăng nhập thành công tài khoản @${accountData.username}! Phiên đăng nhập đã được lưu cho các lần sau.`,
          });
        } else {
          await sendEvent('error', {
            error: result.error || 'Đăng nhập không thành công hoặc hết thời gian chờ.',
          });
        }
      } catch (err: any) {
        await sendEvent('error', { error: err.message });
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

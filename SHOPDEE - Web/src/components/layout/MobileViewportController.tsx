"use client";

import { useEffect } from "react";

/**
 * MobileViewportController:
 * 1. Ngăn website tự động phóng to (auto-zoom) khi truy cập hoặc khi focus vào các ô nhập liệu trên điện thoại.
 * 2. Cho phép người dùng phóng to (zoom in) bằng cử chỉ 2 ngón tay (giữ để soi chi tiết).
 * 3. Khi người dùng thả tay ra (touchend kết thúc tất cả ngón tay), hệ thống sẽ TỰ ĐỘNG trả về kích thước chuẩn ban đầu (scale 1.0).
 * 4. Tự động trả về scale 1.0 khi người dùng thoát khỏi ô nhập liệu (focusout/blur).
 */
export default function MobileViewportController() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isPinching = false;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const resetViewportScale = () => {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) return;

      // Ép browser viewport về scale 1.0 tức thì
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
      );

      // Reset độ lệch scroll nếu visualViewport bị dịch chuyển trong lúc zoom
      if (window.visualViewport) {
        if (window.visualViewport.offsetLeft !== 0 || window.visualViewport.offsetTop !== 0) {
          window.scrollTo({
            left: window.scrollX,
            top: window.scrollY,
            behavior: "auto",
          });
        }
      }

      // Khôi phục lại quyền zoom (maximum-scale=5, user-scalable=yes) sau khi browser đã ổn định ở kích thước chuẩn
      // Nhờ đó, người dùng vẫn có thể tiếp tục giữ 2 ngón tay để zoom lại bất cứ lúc nào!
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        viewportMeta.setAttribute(
          "content",
          "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover"
        );
      }, 350);
    };

    // Khi người dùng chạm từ 2 ngón tay trở lên => bắt đầu cử chỉ giữ zoom
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        isPinching = true;
      }
    };

    // Khi người dùng thả tay ra khỏi màn hình (số ngón tay chạm về 0)
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        const visualScale = window.visualViewport ? window.visualViewport.scale : 1;
        // Nếu vừa thực hiện thao tác pinch hoặc viewport đang bị zoom lớn hơn chuẩn
        if (isPinching || visualScale > 1.02) {
          isPinching = false;
          // Tự động trả về kích thước giao diện ban đầu
          resetViewportScale();
        }
      }
    };

    // Khi người dùng rời khỏi ô nhập liệu (input, select, textarea)
    // đảm bảo nếu trình duyệt có zoom vào ô nhập thì sẽ trả về kích thước chuẩn ngay
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        setTimeout(() => {
          const visualScale = window.visualViewport ? window.visualViewport.scale : 1;
          if (visualScale > 1.01) {
            resetViewportScale();
          }
        }, 150);
      }
    };

    // Khi xoay màn hình (orientation change)
    const handleOrientationChange = () => {
      setTimeout(resetViewportScale, 300);
    };

    // Gắn event listeners vào window
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    window.addEventListener("focusout", handleFocusOut, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

    // Kiểm tra ban đầu khi vừa tải trang trên di động
    if (window.visualViewport && window.visualViewport.scale > 1.02) {
      resetViewportScale();
    }

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      window.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("orientationchange", handleOrientationChange);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  return null;
}

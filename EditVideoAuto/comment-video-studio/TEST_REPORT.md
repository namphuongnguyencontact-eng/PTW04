# Báo cáo kiểm thử

Ngày kiểm thử gần nhất: 19/10/2026 — macOS Apple Silicon.

## Tự động

- TypeScript typecheck: đạt.
- 57 bài test backend/frontend/shared: đạt (23 shared, 32 backend, 2 frontend).
- FFmpeg integration riêng: render project 6 comment cao thấp khác nhau (gồm chuỗi 1, 1.1, 1.2), 5 video minh họa có thời lượng khác nhau ở chế độ phát hết clip, B-roll nhiều đoạn và 1 nhạc nền thật, đạt.
- Integration watermark/logo: watermark tiếng Việt và logo bán trong suốt xuất hiện đúng vị trí ở frame đầu, giữa và cuối, đạt.
- Production build: đạt.
- Production bundle CommonJS khởi động trên `127.0.0.1`, API health, SPA fallback và JS asset đều trả HTTP 200.
- UI interaction test: tạo project và mở studio, đạt.

## Media được FFprobe xác minh

- Integration Smart Layout/B-roll: MP4 H.264 **1080×1920**, 30 FPS, AAC 48 kHz, dài 10,633333 giây.
- Sáu ảnh nghiệm thu có kích thước từ 900×180 đến 900×3200; frame đầu, giữa và cuối đều nằm trong vùng an toàn, không crop hay kéo méo.
- Voice dài 8,15 giây sinh 3 đoạn B-roll (4 s + 4 s + phần lẻ); toàn project sinh 8 đoạn, không lặp clip liên tiếp khi thư viện có nhiều clip.
- Kiểm thử thư viện lớn xác nhận 58 clip được dùng đủ 58 clip trước khi lặp; thư viện 120 clip tự giới hạn mục tiêu 80 clip khác nhau để tránh timeline FFmpeg quá nặng.
- Import 55 video giữ đủ 55 video trong thư viện nhưng chỉ tạo 48 thumbnail, giảm thời gian quét và dung lượng ảnh phụ mà không giảm nguồn random.
- API import thực tế nhận 520 B-roll trong cùng một request, giữ đủ 520 clip và chỉ tạo 48 thumbnail; không còn lỗi Multer `Too many files` ở mốc 500.
- Chế độ theo thời lượng nguồn: clip 5 giây chạy 3 giây cuối comment đầu, tiếp tục đúng từ giây thứ 3 trong 2 giây đầu comment sau, rồi mới đổi clip; không restart ở ranh giới comment.
- Comment cha-con được đánh số 1, 1.1, 1.2, 2; filter FFmpeg giữ ảnh cha đến hết chuỗi con và ẩn ảnh con tại frame cuối voice, không kéo dài qua thời gian nghỉ.
- Mô phỏng không ghi dữ liệu trên project mẫu 58 clip: 58 video nguồn, chế độ tối đa tự chọn 2,5 giây, tạo 65 đoạn và dùng đủ 58 video khác nhau trước 7 lượt lặp bắt buộc.
- Watermark `@Kênh Việt` được raster hóa local bằng Sharp, giữ dấu tiếng Việt; logo 240×120 được scale theo 16% chiều rộng video và phủ ở tọa độ đã lưu.
- Nghiệm thu production qua API thật: MP4 H.264 **1080×1920**, 30 FPS, AAC mono 48 kHz.
- Audio giọng macOS thật dài 3,822646 s; 3,482958 s; 4,278563 s.
- Timeline đầu dài đúng 385 frame = 12,833333 s sau khi cộng ba khoảng nghỉ 0,4 s.
- Ba frame tại 1 s, 5 s và 9 s chứa đúng ảnh 1, 2, 3; ảnh giữ tỷ lệ, không crop hoặc kéo méo.
- Đồng hồ background tại ba frame lần lượt là 1 s, 2 s, 0 s theo chu kỳ background 3 giây: background lặp theo timeline chung, không restart khi đổi comment.
- Background mẫu có một stream AAC; output chỉ có một stream AAC narration do pipeline không map audio nền.
- Cả 5 clip minh họa mẫu đều có audio nguồn; pipeline không map audio clip, chỉ trộn narration và nhạc đã chọn.
- Nhạc ngắn hơn video được lặp liên tục, fade in/out và sidechain ducking đã đi qua FFmpeg thành công.
- Video minh họa được đặt dưới ảnh comment, clip ngắn tự lặp, mỗi đoạn đổi đúng timeline comment.
- Kết quả và frame đối chiếu nằm trong `data/verification/`; project mẫu được giữ trong danh sách project của ứng dụng.

## TTS

- Danh sách Edge TTS: lấy được, có `vi-VN-HoaiMyNeural` và `vi-VN-NamMinhNeural`.
- Edge TTS generate: tại thời điểm kiểm thử endpoint tạo audio treo/trả file rỗng; không đánh dấu là đạt. Ứng dụng timeout, giữ text và hiển thị lỗi để chuyển provider.
- Giọng macOS `Linh`: tạo audio tiếng Việt có dấu thành công; MP3 48 kHz dài 3,381 giây trong mẫu kiểm tra.
- ElevenLabs: chưa kiểm thử gọi thật vì không có API key và không tự dùng quota trả phí.
- Audio TTS mới được chuẩn hóa bằng FFmpeg: chỉ cắt im lặng đầu/cuối ở ngưỡng -60 dB, không cắt khoảng nghỉ giữa câu.
- Test thực tế với 0,35 s im lặng đầu + 0,5 s âm thanh + 0,8 s im lặng cuối cho kết quả còn khoảng 0,5 s.

## Giao diện và tương thích project

- Preview hiển thị clip minh họa đúng assignment/điểm bắt đầu, mute audio clip và đổi cùng comment.
- Thư viện clip có chọn thư mục, thống kê số nguồn/số đoạn/số clip khác nhau/lượt lặp, tối đa hóa độ đa dạng, phân bổ lại, chọn riêng và khóa từng đoạn.
- UI cho chọn B-roll chia đều hoặc phát hết clip nguồn; có nút thêm nhiều comment con, thụt lề/đánh số theo chuỗi và preview đồng thời ảnh cha + ảnh con.
- Nhạc có nghe thử, bật/tắt, âm lượng, fade in/out, ducking và gỡ file.
- Project chưa có trường `illustrations` hoặc `music` được migration khi đọc; bố cục, background, comment và audio cache cũ được giữ nguyên.
- Project cũ mặc định tắt video minh họa và nhạc, nên kết quả render cũ không tự thay đổi.
- Project cũ chưa có Smart Layout tiếp tục ở chế độ thủ công; trước lần lưu nâng cấp đầu tiên app tạo `project.json.backup-before-smart-layout`.
- Project mới mặc định tốc độ 1,20×, cao độ 0 Hz, nghỉ 0,1 giây, Smart Auto Layout và B-roll nhiều đoạn 4 giây.
- Audio cache cũ được đánh dấu cần đồng bộ và có thể chuẩn hóa lại hoàn toàn local, không phải gọi lại provider.

## Kiểm tra giao diện thực tế

- Tạo/mở project thành công.
- Upload video nền thành công.
- Upload đồng thời ba ảnh thành công, đúng thứ tự.
- Preview hiển thị background và ảnh theo `contain`, không crop/kéo méo.
- Danh sách giọng Edge tiếng Việt hiển thị đúng sau khi sửa đường dẫn runtime.

## Kiểm tra chỉnh sửa và export lại

- Đổi text comment 2 chỉ làm comment 2 chuyển sang `stale`; comment 1 và 3 giữ nguyên cache key và audio.
- Tạo lại riêng comment 2 thành công, cache key mới và thời lượng mới 4,725229 s.
- Export lần hai thành công, dài đúng 422 frame = 14,066667 s.
- Hai output có tên và SHA-256 khác nhau; file cũ không bị ghi đè.

## Sửa đồng bộ chuyển ảnh

- Giá trị mặc định **Nghỉ sau câu** đổi từ 0,4 s thành 0 s theo phản hồi sử dụng thực tế.
- Timeline test xác nhận comment kế tiếp bắt đầu tại frame đầu tiên sau khi audio kết thúc, sai số nhỏ hơn 1/30 giây ở 30 FPS.
- Lỗi timeout tiến trình giờ hiển thị nguyên nhân thời gian chờ thay vì thông báo kỹ thuật `SIGTERM`.
- Edge TTS thử lại tối đa hai lần, mỗi lần giới hạn 45 giây; nếu vẫn lỗi, giao diện đề xuất chuyển sang giọng macOS và giữ nguyên nội dung.

## File nghiệm thu

- Output đầu: `data/outputs/<project-id>/project-mau-nghiem-thu-1080p-2026-10-18T09-55-29-622Z-806a757f.mp4`.
- Output sau chỉnh sửa: `data/outputs/<project-id>/project-mau-nghiem-thu-1080p-2026-10-18T09-56-28-500Z-8ffa0bd6.mp4`.
- FFprobe JSON: `data/verification/ffprobe-output.json` và `data/verification/ffprobe-output-after-edit.json`.
- Smart Layout + B-roll nhiều đoạn: `data/verification/smart-multi-broll-acceptance.mp4`.
- Frame kiểm tra: `data/verification/frames/start.png`, `middle.png`, `end.png`.
- Watermark + logo: `data/verification/watermark-logo-acceptance.mp4`.
- Nghiệm thu sau sửa độ đa dạng B-roll: `data/verification/broll-variety-acceptance.mp4`.
- Nghiệm thu comment cha-con + B-roll phát hết clip: `data/verification/threaded-comments-acceptance.mp4`.
- Frame lớp phủ: `data/verification/branding-frames/start.png`, `middle.png`, `end.png`.

Các test tự động được giữ trong `shared/src`, `backend/src` và `frontend/src`; chạy lại bằng `npm test`.

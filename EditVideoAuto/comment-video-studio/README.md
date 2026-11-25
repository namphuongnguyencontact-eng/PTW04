# COMMENT VIDEO STUDIO

Ứng dụng local cho macOS Apple Silicon để ghép nhiều ảnh comment, nội dung đọc và một video nền thành **một video MP4 dọc duy nhất**.

## Chức năng chính

- Quản lý nhiều project lưu bằng JSON trên máy.
- Nhập video nền MP4/MOV/M4V/WebM và nhiều ảnh PNG/JPEG/WebP cùng lúc.
- Kéo thả đổi thứ tự, nhân bản, xóa và nhập nội dung cho từng comment.
- TTS nhiều provider: Edge TTS, ElevenLabs tùy chọn, giọng macOS và VoiceStudio Local.
- Cache audio theo text/provider/voice/tốc độ/cao độ; chỉ tạo lại đoạn đã thay đổi.
- Dán link bài Threads công khai, mở bằng Chrome local, đọc comment và reply rồi xếp hạng theo lượt tim, độ liên quan và sức hút. Tool nhận diện bài gốc bằng chính URL thay vì vị trí trên trang nên comment ghim không bị biến thành bài gốc/cha. Comment ngắn vẫn được giữ nếu phù hợp hoặc nhiều tim; chọn reply sẽ tự nhập comment cha thành chuỗi 1 → 1.1.
- Tạo card comment Threads local với tên, nội dung và chỉ số tương tác. Avatar được loại bằng kích thước hiển thị, nhãn và link profile; chỉ ảnh media thật của bài/comment được OCR local. Bộ phân loại bảo thủ tách ảnh minh họa, ảnh có chữ và hội thoại để tránh nhận nhầm danh sách thành chat.
- Với ảnh nội dung, ứng dụng đọc comment trước rồi phát tiếng click và chuyển sang ảnh. Ảnh không chữ chỉ được giữ thêm 2 giây; ảnh có chữ được đọc theo thứ tự trên xuống dưới, trái sang phải rồi giữ thêm 2 giây. OCR gốc và bản đọc đã sửa teencode/lỗi chính tả phổ biến đều có thể chỉnh riêng.
- Gắn ảnh hội thoại vào từng comment, OCR local bằng Apple Vision, tự nhóm bong bóng trái/phải và cho sửa lại từng tin trước khi tạo giọng.
- Hai giọng riêng cho Người A/B; ảnh chat mở hoặc cuộn xuống đúng mốc từng tin dựa trên thời lượng audio thật.
- Tự tải và cache âm **ding sound effect** từ MyInstants; mỗi tin phát ding một lần khi xuất hiện, có chỉnh âm lượng và độ trễ trước lời đọc.
- Tự tải đúng hai âm xuất hiện comment đã chọn từ MyInstants: chỉ comment đầu tiên dùng **tununuuuu**, mọi comment thường sau đó dùng **mouse click by ek6**; comment hội thoại không phát hai âm này vì đã dùng ding theo từng tin.
- Tự cắt phần im lặng thừa ở đầu/cuối audio; timeline dùng thời lượng audio đo bằng FFprobe, chính xác theo frame.
- Preview 9:16 với video nền, ảnh comment, audio và thanh timeline.
- Smart Auto Layout dùng kích thước thật của từng ảnh để căn nhóm comment + khoảng cách + B-roll trong vùng an toàn; có chế độ thủ công và nút đặt lại.
- Nhập không giới hạn số lượng video từ cả thư mục minh họa trong một lần chọn, kiểm tra tuần tự bằng FFprobe và đưa toàn bộ clip hợp lệ vào thư viện random; chỉ tạo tối đa 48 thumbnail để thư mục lớn không làm quá trình quét nặng không cần thiết. Mỗi file vẫn được giới hạn 2 GB để bảo vệ dung lượng máy.
- B-roll mặc định đổi mỗi 4 giây, có shuffle bag dùng hết clip chưa xuất hiện trước khi lặp. Nút **Tối đa hóa độ đa dạng** tự chọn nhịp 2–10 giây để dùng tối đa thư viện với mục tiêu an toàn 80 video khác nhau mỗi đầu ra.
- B-roll có thêm chế độ **Phát hết clip rồi mới đổi**: mỗi file chạy từ đầu đến hết thời lượng nguồn, nối tiếp qua ranh giới comment mà không restart rồi mới chuyển clip kế tiếp.
- Hỗ trợ comment cha-con 1 → 1.1 → 1.2: voice phát tuần tự; ảnh cha được giữ khi từng ảnh con xuất hiện, ảnh con biến mất khi voice kết thúc và Smart Layout tự xếp cha + con + B-roll trong vùng an toàn.
- Áp dụng tốc độ, cao độ và thời gian nghỉ hàng loạt mà vẫn giữ provider/voice riêng; chỉ tốc độ hoặc cao độ làm audio cũ cần tạo lại.
- Nhạc nền liên tục với âm lượng mặc định 10%, fade in/out và tùy chọn tự hạ nhạc khi có giọng đọc.
- Watermark chữ chạy xuyên suốt video: sửa nội dung, độ mờ, cỡ chữ và vị trí ngay trong project.
- Logo kênh PNG/JPEG/WebP: chỉnh độ mờ, kích thước, tọa độ hoặc kéo trực tiếp trên khung preview.
- Render FFmpeg theo frame: background chạy liên tục, ảnh không crop, audio không chồng.
- Hàng đợi xuất tuần tự, hiển thị tiến độ, hủy và chạy lại.
- Tùy chọn tự đăng TikTok sau khi xuất bằng chính hồ sơ Google Chrome thật đã chọn cho từng project. Tool mở TikTok Studio, chọn MP4 vừa render, điền caption, đăng ngay hoặc lên lịch; có xác nhận cuối và hàng đợi TikTok riêng để dừng/thử lại.
- MP4 H.264/AAC 48 kHz, 30 FPS ở 1080×1920 hoặc 720×1280.

## Cài đặt lần đầu

Yêu cầu: macOS, Apple Command Line Tools, Node.js 22–25, Python 3 và FFmpeg/FFprobe. Script không tự cài Homebrew hoặc thay đổi bảo mật macOS.

1. Mở Terminal tại thư mục này.
2. Chạy:

   ```bash
   ./setup.sh
   ```

3. Sau khi hoàn tất, nhấp đúp `start.command` để mở ứng dụng.

Ứng dụng chỉ bind vào `127.0.0.1:43123`. Giữ cửa sổ Terminal của `start.command` mở trong lúc sử dụng; nhấn `Control+C` để dừng.

## Quy trình tạo video

1. Tạo project và chọn video nền.
2. Chọn nhiều ảnh comment; ứng dụng tạo một mục cho mỗi ảnh. Hoặc dán link tại **Nhập tự động từ Threads**, bấm **Mở Chrome local để đăng nhập**, đăng nhập Threads trong cửa sổ vừa mở rồi quay lại bấm phân tích. Chrome được giữ mở và tái sử dụng phiên đăng nhập cho các lần đọc tiếp theo; sau đó kiểm tra danh sách đề xuất rồi chọn comment/reply muốn nhập.
   Card Threads dùng avatar xám trống khi không có ảnh đại diện phù hợp, không chèn chữ cái đầu tài khoản.
3. Chọn từng comment, nhập nội dung đọc và chọn provider/giọng.
4. Nếu comment có ảnh kèm theo, dùng **Ảnh nội dung sau comment** để tool tự phân loại. Kiểm tra OCR gốc và nội dung sẽ đọc, hoặc ép chế độ **Ảnh minh họa** / **Ảnh có chữ** khi cần. Với đoạn chat, dùng **Hội thoại trong ảnh**, sửa text, đổi Người A/B hoặc thứ tự; chọn hai giọng, chế độ cuộn và âm lượng ding.
5. Kiểm tra **Nội dung đọc cho TTS**. Nút **Chuẩn hóa teencode** sẽ đổi từ viết tắt phổ biến và bỏ emoji, sticker, icon khỏi phần đọc nhưng không sửa nội dung comment gốc. Sau đó nhấn **Tạo giọng đọc** hoặc **Tạo tất cả giọng đọc**.
6. Dùng **Xóa hết comment** khi muốn làm bài mới trong cùng project. Chức năng này chỉ xóa comment và media/audio riêng của chúng; video nền, B-roll, nhạc, watermark, logo và mọi setting khác được giữ nguyên.
7. Nút **Tạo giọng đọc còn thiếu hoặc bị lỗi** bỏ qua audio đang sẵn sàng, tiếp tục chạy nếu một comment lỗi và báo tổng số thành công/bỏ qua/lỗi. Edge TTS tự chia nội dung dài và thử tối đa ba lần; khi vẫn lỗi có thể chuyển riêng comment đó sang giọng macOS local.
6. Trong **Video minh họa**, chọn một thư mục clip. Ứng dụng sao chép toàn bộ file hợp lệ vào project và sinh timeline B-roll đã lưu. Bảng thống kê cho biết số video trong thư viện, số đoạn timeline, số video khác nhau đang dùng và số lượt lặp. Dùng **Tối đa hóa độ đa dạng** để ưu tiên dùng hết clip trước khi lặp; có thể chỉnh chu kỳ 2–10 giây, random lại, chọn riêng hoặc khóa từng đoạn.
7. Trong **Cách chuyển clip**, chọn **Chia đều theo số giây** hoặc **Phát hết clip rồi mới đổi**. Chế độ thứ hai phù hợp với clip đã edit có thời lượng khác nhau và giảm số lượng B-roll cần dùng.
8. Chọn một comment cha rồi bấm **Thêm comment con cho 1** để nhập một hoặc nhiều ảnh 1.1, 1.2… Nhập text và tạo voice cho từng comment con như comment thường.
9. Tùy chọn: trong **Nhạc nền**, chọn file nhạc, nghe thử, chỉnh âm lượng/fade và bật hoặc tắt ducking.
10. Trong **Watermark & logo kênh**, nhập chữ watermark hoặc thêm logo. Điều chỉnh độ mờ và vị trí; logo có thể kéo trực tiếp trên preview.
11. Nghe thử, tua timeline và điều chỉnh kích thước/vị trí ảnh cùng vùng video minh họa.
12. Chọn độ phân giải và nhấn **Xuất video**. Nếu bật **Đăng TikTok tự động**, chọn hồ sơ Chrome, nhập caption, chọn **Đăng bây giờ** hoặc **Lên lịch**, rồi kiểm tra lại hồ sơ và thời điểm trong hộp xác nhận cuối.
13. Theo dõi hàng đợi xuất và hàng đợi TikTok; khi hoàn tất vẫn có thể xem video hoặc mở thư mục chứa file.

### Đăng TikTok bằng hồ sơ Chrome thật

- Mỗi project lưu riêng tên/thư mục hồ sơ Chrome, caption và chế độ đăng. Danh sách được đọc từ Google Chrome trên máy; tool không sao chép mật khẩu hoặc cookie.
- Lần đầu với mỗi máy, trong Chrome bật **Xem → Nhà phát triển → Cho phép JavaScript từ Apple Events**. Sau đó vào **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Trợ năng** và cấp quyền cho Terminal (hoặc ứng dụng dòng lệnh đang chạy `start.command`).
- Bấm **Mở & kiểm tra đúng hồ sơ** trước. Tool chỉ mở trang TikTok Studio trong hồ sơ đã chọn và báo riêng trạng thái Apple Events/Trợ năng; bước kiểm tra không chọn hoặc đăng video.
- Khi xác nhận **Xuất & đăng**, video vẫn được render local trước. Chỉ khi render đạt 100% tool mới mở đúng hồ sơ, chọn file đầu ra, điền caption, đặt lịch nếu có và bấm đúng nút **Đăng**/**Lên lịch**.
- Nếu TikTok yêu cầu đăng nhập, CAPTCHA, kiểm tra nội dung, thay đổi giao diện hoặc thiếu quyền macOS, tác vụ dừng an toàn và giữ tab mở để xử lý. Không tự dò hoặc bấm một nút khác. Sau khi xử lý có thể bấm **Thử lại** trong hàng đợi TikTok.

### Nhập từ Threads

- Lần đầu phân tích, ứng dụng mở một cửa sổ Google Chrome với profile riêng trong `data/cache/threads-browser`. Request chờ tối đa 5 phút để bạn đăng nhập và không cuộn trang trong lúc đăng nhập. Cookie chỉ nằm trong profile Chrome local, không được chép vào project.
- Sau khi trang thật sẵn sàng, tool cuộn tối thiểu 12 lượt, tiếp tục cho tới khi danh sách ổn định và tự bấm các nút **Hiển thị câu trả lời** đang thấy. Bài gốc được chọn mặc định nhưng có thể bỏ chọn trong cửa sổ duyệt trước.
- Comment nhập từ link dùng chung pipeline với comment thủ công: TTS/cache, B-roll đã chọn trong project, Smart Layout, sound effect, nhạc nền, watermark, logo và export FFmpeg. Nếu project chưa có thư viện B-roll hoặc chưa bật watermark/logo, giao diện báo rõ sau khi nhập thay vì giả vờ đã có.
- Threads có thể thay đổi giao diện hoặc giới hạn số reply tải được, vì vậy luôn kiểm tra text, tên, lượt tim, cây reply và ảnh trong màn hình chọn trước khi nhập.
- Nút **Chọn đề xuất** cân bằng lượt tim, mức liên quan và sắc thái. Nút **Chọn nhiều tim nhất** chỉ ưu tiên tương tác. Không có quy tắc loại comment chỉ vì nó ngắn.
- Dữ liệu đã nhập trở thành asset local của project. Card được tạo trên máy; text vẫn có thể sửa trước khi tạo giọng đọc.

Project, cache và output mặc định nằm trong `data/`. Video xuất nằm ở `data/outputs/<project-id>/` và luôn có tên mới, không ghi đè file cũ.

Thanh **Nghỉ sau câu** mặc định là `0,1 giây`. Đặt thành `0 giây` (có thể dùng **Áp dụng cho tất cả comment**) nếu muốn ảnh kế tiếp xuất hiện tại frame đầu tiên ngay sau khi voice kết thúc.

## TTS và quyền riêng tư

- **Edge TTS:** online, không cần API key nhưng là dịch vụ không chính thức, có thể thay đổi hoặc giới hạn. Chỉ text được gửi đi.
- **VoiceStudio Local (tùy chọn):** ứng dụng kết nối trực tiếp backend tương thích OpenAI tại `http://127.0.0.1:3900`, tải danh sách voice profile và có thể luân phiên giọng cho từng comment. COMMENT VIDEO STUDIO không tự tải model hoặc khởi chạy thêm giao diện VoiceStudio; hãy cài và mở backend theo [hướng dẫn macOS của VoiceStudio](https://github.com/debpalash/VoiceStudio/blob/main/docs/install/macos.md), sau đó bấm **Kiểm tra lại**. Có thể đổi địa chỉ bằng `VOICESTUDIO_URL` trong `.env`.
- VoiceStudio và các model có giấy phép riêng; hãy kiểm tra giấy phép model trước khi dùng cho nội dung thương mại. Máy nên còn ít nhất khoảng 10 GB trống để cài ứng dụng/model. Nếu chưa đủ dung lượng, Edge TTS và giọng macOS vẫn hoạt động độc lập.
- **Giọng macOS:** offline, text không rời khỏi máy. Máy hiện có giọng tiếng Việt `Linh`.
- **ElevenLabs:** chỉ hoạt động khi người dùng chủ động chọn và lưu API key. Key được lưu trong macOS Keychain với service `COMMENT_VIDEO_STUDIO_ELEVENLABS`, không nằm trong project hay log. Dịch vụ có thể tiêu tốn quota trả phí.

Ảnh và video nguồn không được upload ra ngoài trừ khi người dùng chủ động bật và xác nhận **Đăng TikTok tự động**; khi đó chỉ MP4 vừa xuất và caption được đưa vào trang TikTok Studio của hồ sơ đã chọn. OCR ảnh hội thoại chạy local bằng Apple Vision; chỉ text được gửi ra ngoài nếu người dùng chủ động tạo giọng bằng một provider online. Ứng dụng không tự gọi ElevenLabs. Khi dùng nhập Threads, Chrome kết nối trực tiếp tới Threads và backend tải ảnh được chọn từ CDN chính thức của Threads/Meta; không gửi media đó tới dịch vụ AI khác.

## Lưu ý bảo mật

- **Chỉ chạy local:** Server mặc định bind vào `127.0.0.1:43123`, chỉ chấp nhận request từ `Host`/`Origin` loopback và chỉ phục vụ media trong `data/projects/` và `data/outputs/` (chặn truy cập vào `data/cache/` và file log).
- **Không chia sẻ thư mục `data/` hoặc file `.env`:** Thư mục `data/cache/threads-browser/` chứa phiên đăng nhập trình duyệt Threads cục bộ, còn `.env` (nếu bạn tự tạo) có thể chứa API key. Cả hai đều được `.gitignore` loại trừ khỏi Git.
- **Quyền macOS cho tính năng tự đăng TikTok:** Bật **Cho phép JavaScript từ Apple Events** trong Chrome và cấp quyền **Trợ năng (Accessibility)** cho Terminal là các quyền mức hệ thống rất mạnh (cho phép script cục bộ điều khiển trình duyệt và gửi thao tác bàn phím). Chỉ bật khi bạn tin tưởng môi trường máy cá nhân, không chuyển sang cửa sổ ứng dụng khác khi tool đang dán đường dẫn/caption, và cân nhắc tắt lại tùy chọn Apple Events trong Chrome khi không sử dụng tính năng tự đăng.

## Video minh họa và nhạc nền

- Chế độ mặc định là **nhiều clip mỗi comment**, chu kỳ 4 giây. Mỗi đoạn có ID, comment, video nguồn, thời điểm tuyệt đối, thời lượng, điểm bắt đầu nguồn và trạng thái khóa trong `project.json`.
- Thư mục gốc không được tham chiếu trực tiếp: app sao chép các file đã chọn vào project. Vì vậy project vẫn hoạt động nếu thư mục gốc bị đổi tên hoặc di chuyển.
- Audio nằm trong video nền và clip minh họa luôn bị bỏ. Audio đầu ra chỉ gồm narration và nhạc người dùng chủ động bật.
- Preview và FFmpeg dùng chung phép tính Smart Layout và cùng timeline B-roll đã lưu trong `project.json`, hạn chế lệch giữa xem trước và file xuất.
- Watermark được raster hóa local thành PNG trong suốt trước khi FFmpeg render để hỗ trợ tiếng Việt ngay cả khi bản FFmpeg không có filter `drawtext`. Logo và watermark đều được phủ sau comment/B-roll nên luôn hiển thị xuyên suốt video.

## Dữ liệu mẫu

Thư mục `assets/sample/` có video nền và các ảnh comment khác tỷ lệ để thử quy trình. Bộ integration test tự tạo thêm 5 clip minh họa, 6 ảnh từ rất thấp đến rất cao, 6 audio (có một voice dài hơn 8 giây) và một file nhạc; audio nguồn của background/clip phải biến mất trong file xuất.

## Phát triển

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

Backend và frontend dev lần lượt chạy tại `127.0.0.1:43123` và `127.0.0.1:43124`. Bản production được bundle thành `backend/bundle/server.cjs` để giảm số file dependency phải đọc khi khởi động.

## Xử lý sự cố

- **Edge TTS lỗi hoặc treo:** ứng dụng thử lại tối đa hai lần rồi báo rõ; provider không còn tự nhảy sang macOS. Bạn chủ động bấm **Chuyển comment này sang giọng macOS** hoặc thử lại sau; nội dung đã nhập không bị mất.
- **Thiếu FFmpeg/FFprobe:** cài FFmpeg rồi chạy lại `setup.sh`.
- **Project báo thiếu file:** chọn lại media đã bị di chuyển hoặc xóa.
- **Một file trong thư mục clip bị bỏ qua:** xem thanh cảnh báo; app ghi rõ tên file và lỗi định dạng/FFprobe, các clip hợp lệ khác vẫn được nhập.
- **Comment chưa có video minh họa:** chọn video tại phần thuộc tính comment hoặc nhấn **Phân bổ ngẫu nhiên lại** trước khi xuất.
- **Không đọc được link Threads:** giữ cửa sổ Chrome local mở, đăng nhập trong vòng 5 phút và chờ tool cuộn xong. Nếu vẫn lỗi, kiểm tra bài còn công khai; không nhập mù khi giao diện Threads vừa thay đổi.
- **TikTok mở đúng hồ sơ nhưng không tự điền:** bấm lại **Mở & kiểm tra đúng hồ sơ**. Bật JavaScript từ Apple Events trong menu Nhà phát triển của Chrome và cấp quyền Trợ năng cho Terminal. Nếu hai trạng thái đều đạt mà TikTok vẫn lỗi, giữ tab mở để kiểm tra đăng nhập, CAPTCHA hoặc cảnh báo nội dung.
- **Không mở được ứng dụng:** xem `data/app.log`.
- **Port 43123 đang dùng:** đóng phiên COMMENT VIDEO STUDIO cũ rồi mở lại.

## Kiến trúc

- Frontend: React + TypeScript + Vite.
- Backend: Node.js + TypeScript + Express.
- Render: FFmpeg/FFprobe, gọi bằng mảng tham số thay vì ghép chuỗi shell.
- Storage: filesystem local + JSON atomic write.
- TTS: provider interface độc lập, cache SHA-256.

Remotion, HyperFrames và Captions không được đưa vào runtime V1 vì pipeline ảnh tĩnh trên background liên tục được FFmpeg xử lý đơn giản và ổn định hơn.

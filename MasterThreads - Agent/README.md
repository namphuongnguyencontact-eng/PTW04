# Threads Affiliate Intelligence 🧵✨

> Nền tảng Social Listening & AI Matching chuyên sâu dành cho Affiliate Marketer trên mạng xã hội **Threads** tại Việt Nam.

Ứng dụng giúp người làm affiliate phát hiện những bài viết có độ lan truyền cao, phân tích bài viết và bình luận công khai, bóc tách insight, vấn đề (pain points) và nhu cầu người đọc, sau đó đối chiếu thông minh với toàn bộ danh mục sản phẩm affiliate của người dùng để đề xuất góc tiếp cận tự nhiên, không gây cảm giác quảng cáo gượng ép.

---

## 🎨 Bảng màu & Ngôn ngữ thiết kế chuẩn

Ứng dụng được thiết kế theo đúng bảng màu quy định:

| Màu sắc | Mã Hex | Vai trò trong giao diện |
| :--- | :--- | :--- |
| **Trắng kem** | `#FEFAF3` | Background chính của toàn bộ ứng dụng và canvas nội dung |
| **Hồng pastel** | `#F6E2E9` | Sidebar cố định bên trái, các vùng phân tách nhẹ và badge |
| **Xanh lá trầm** | `#84A282` | Nút hành động chính (Primary CTA), trạng thái kích hoạt, biểu tượng |
| **Xanh lá nhạt** | `#B8CFB3` | Nền card phụ, điểm nổi bật, chip phân loại và thanh biểu đồ |
| **Xanh đen / Slate** | `#222B24` | Typography chữ chính với độ tương phản cao, dễ đọc |
| **Xám trung tính** | `#5E6D62` | Chữ phụ, ghi chú và metadata |

- **Ngôn ngữ mặc định**: Tiếng Việt (vi-VN).
- **Múi giờ mặc định**: `Asia/Ho_Chi_Minh` (GMT+7).

---

## 🚀 Các tính năng chính (Core Features)

### 1. Quản lý sản phẩm affiliate (Feature A)
- **Module CRUD hoàn chỉnh**: Thêm, sửa, xóa, tìm kiếm theo từ khóa, lọc theo danh mục, sàn thương mại (Shopee, TikTok Shop, Lazada, v.v.) và trạng thái hoạt động.
- **Dữ liệu chuyên sâu**: Tên sản phẩm, thương hiệu, mô tả, các vấn đề giải quyết (pain points), đối tượng khách hàng mục tiêu, tình huống thực tế, từ khóa liên quan, từ khóa đồng nghĩa, từ khóa loại trừ (negative keywords), giá tham khảo, link affiliate.
- **Import / Export**:
  - Nhập hàng loạt từ CSV / JSON theo quy trình 3 bước (Upload -> Xem trước & Ánh xạ -> Kiểm tra lỗi -> Xác nhận lưu).
  - Xuất toàn bộ danh sách ra file CSV chuẩn UTF-8 BOM tương thích hoàn hảo với Microsoft Excel.

### 2. Thu thập bài viết Threads & Chiến dịch quét (Feature B)
- **Kiến trúc Adapter tách biệt**:
  - `ThreadsAdapter`: Hỗ trợ Meta Graph API chính thức (`threads_basic`, `threads_content_publish`, `threads_read_replies`).
  - Hỗ trợ nhập trực tiếp URL bài viết Threads (tự động phân tích username và post ID).
  - Khử trùng lặp bài viết (`threadsPostId`) và tự động lưu lịch sử chỉ số tương tác theo thời điểm (`PostMetricsSnapshot`).
- **Chiến dịch quét (Scan Campaigns)**:
  - Thiết lập chiến dịch theo chủ đề, từ khóa chính, từ khóa phụ, ngưỡng tương tác tối thiểu và danh mục sản phẩm đối chiếu.
  - Theo dõi tiến trình minh bạch: Chờ xử lý, Đang chạy, Đã hoàn thành, Chưa cấu hình nguồn API.

### 3. Phát hiện bài viết viral & Hệ thống tính điểm (Feature C)
- **Engagement Count**: Tổng lượt tương tác không trùng lặp (`likes + replies + reposts + quotes`).
- **Viral Score (0–100)**:
  - 45% Khối lượng tương tác (Logarithmic volume scaling).
  - 35% Tốc độ tương tác theo thời gian (`velocityPerHour = engagement / ageHours`).
  - 20% Độ tươi mới / chu kỳ suy giảm theo tuổi bài viết.
  - Phân loại: *Viral nổi bật (≥80)*, *Tương tác cao (60-79)*, *Đang tăng trưởng (40-59)*, *Tiềm năng (20-39)*, *Tương tác thấp (<20)*.

### 4. AI phân tích bài viết & Bình luận (Feature D & H)
- **Quy trình 6 bước chuyên sâu**:
  1. **Phân tích bài viết**: Nhận diện mục đích (hỏi đáp, than phiền, chia sẻ kinh nghiệm...), cảm xúc chủ đạo, bóc tách Pain Points kèm trích đoạn làm bằng chứng.
  2. **Phân tích bình luận**: Chỉ phân tích bình luận công khai có thật, trích xuất câu hỏi, nhu cầu trực tiếp và ý kiến phản đối. Không tự bịa số liệu hay bình luận ảo.
  3. **Đối chiếu sản phẩm**: Kiểm tra từ khóa, từ khóa loại trừ, vấn đề giải quyết và tệp khách hàng.
  4. **Phân loại cơ hội**: *Phù hợp trực tiếp (Direct Fit)*, *Phù hợp theo ngữ cảnh (Contextual Fit)*, *Nhu cầu tiềm ẩn (Latent Need)*, *Nhu cầu từ bình luận (Comment Demand)*, *Liên quan yếu*, *Không phù hợp*.
  5. **Đề xuất góc khai thác**: Gợi ý cách chia sẻ tự nhiên, rủi ro khiến quảng cáo bị gượng ép, mức độ ưu tiên (Cao / TB / Thấp).
  6. **Opportunity Score (0–100)**: Tính độc lập với Viral Score theo trọng số (35% Relevance, 25% Problem Fit, 20% Context Fit, 10% Comment Evidence, 10% Confidence). Tự động chuẩn hóa khi bài viết không có dữ liệu bình luận.
- **Lớp AI Provider linh hoạt**:
  - **Local Heuristic Engine**: Thuật toán NLP ngữ nghĩa nội bộ tiếng Việt, hoạt động ngay lập tức mà không cần API key bên ngoài.
  - **Google Gemini API**: Tích hợp `gemini-1.5-flash` / `gemini-1.5-pro` qua Structured JSON Output.
  - **OpenAI API**: Tích hợp `gpt-4o-mini` / `gpt-4o` qua JSON Schema Mode.

### 5. Trang kết quả & Modal chi tiết 5 Tab (Feature E & F)
- Trang kết quả bài viết tiềm năng với đầy đủ bộ lọc đa chiều (điểm cơ hội, điểm viral, danh mục, sản phẩm, trạng thái lưu).
- Modal phân tích chi tiết gồm 5 tab:
  - **Tab 1: Tổng quan**: Chỉ số tương tác, tóm tắt AI, chủ đề chính, top sản phẩm phù hợp.
  - **Tab 2: Phân tích Insight**: Danh sách Pain Points kèm trích dẫn thực tế, nhu cầu khán giả, rủi ro quảng cáo.
  - **Tab 3: Phân tích bình luận**: Trạng thái minh bạch của bình luận, câu hỏi phổ biến, ý kiến nghi ngờ.
  - **Tab 4: Sản phẩm phù hợp**: Bảng phân rã điểm thành phần, lý do phù hợp, góc tiếp cận, link affiliate.
  - **Tab 5: Ghi chú & Trạng thái**: Đánh dấu trạng thái nghiên cứu, kịch bản cá nhân, ghi nhận chuyển đổi thực tế.

### 6. Dashboard KPI & Dữ liệu mẫu (Feature G & 18)
- 6 thẻ KPI tính toán trực tiếp từ cơ sở dữ liệu SQLite: Tổng bài viết, Đã phân tích AI, Có sản phẩm khớp, Cơ hội cao (≥75), Chiến dịch hoàn thành, Sản phẩm hoạt động.
- Biểu đồ phân bố điểm Viral, phân bố điểm Opportunity, hiệu suất theo danh mục và chủ đề nổi bật.
- Bảng cơ hội affiliate mới nhất.
- Nút **Tải dữ liệu mẫu (Seed Demo)** và **Xóa dữ liệu mẫu (Reset Demo)** giúp kiểm thử toàn bộ ứng dụng chỉ với 1 cú click.

---

## 🛠️ Kiến trúc kỹ thuật (Tech Stack)

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript.
- **Styling**: Tailwind CSS v4, Lucide React Icons.
- **Database**: SQLite lưu trữ cục bộ tại `file:./dev.db` (dễ dàng chuyển sang PostgreSQL khi cần).
- **ORM**: Prisma Client v6.19.3.
- **Validation**: Zod schema validation.
- **Testing**: Node.js Native Test Runner (`node --test`).

---

## 📁 Cấu trúc thư mục

```
MasterThreads/
├── prisma/
│   ├── dev.db                 # Database SQLite
│   └── schema.prisma          # Schema Prisma hoàn chỉnh
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analytics/     # API thống kê tổng quan
│   │   │   ├── campaigns/     # API quản lý & chạy chiến dịch
│   │   │   ├── categories/    # API CRUD danh mục
│   │   │   ├── demo/          # API nạp & xóa dữ liệu mẫu
│   │   │   ├── posts/         # API bài viết, ingestion & AI analyze
│   │   │   ├── products/      # API CRUD, import, export sản phẩm
│   │   │   └── settings/      # API cấu hình AI & Meta Threads
│   │   ├── ai-analysis/       # Trang AI Playground trực tiếp
│   │   ├── campaigns/         # Trang Chiến dịch quét
│   │   ├── categories/        # Trang Danh mục sản phẩm
│   │   ├── opportunities/     # Trang Bài viết tiềm năng
│   │   ├── products/          # Trang Sản phẩm của tôi
│   │   ├── saved-posts/       # Trang Bài viết đã lưu
│   │   ├── settings/          # Trang Cài đặt hệ thống
│   │   ├── globals.css        # CSS & Palette màu chuẩn
│   │   ├── layout.tsx         # Root layout Tiếng Việt
│   │   └── page.tsx           # Dashboard tổng quan
│   ├── components/
│   │   ├── AddPostModal.tsx   # Modal thêm bài viết Threads
│   │   ├── CampaignModal.tsx  # Modal tạo chiến dịch quét
│   │   ├── CategoryModal.tsx  # Modal thêm/sửa danh mục
│   │   ├── ImportModal.tsx    # Wizard nhập sản phẩm CSV/JSON
│   │   ├── PostDetailModal.tsx# Modal phân tích chi tiết 5 Tab
│   │   ├── ProductModal.tsx   # Modal thêm/sửa sản phẩm
│   │   ├── Sidebar.tsx        # Thanh điều hướng 8 mục
│   │   └── TopNav.tsx         # Thanh trạng thái & Demo switcher
│   ├── lib/
│   │   ├── adapters/          # Threads API adapter
│   │   ├── ai/                # AI service, schema & Local analyzer
│   │   ├── prisma.ts          # Singleton Prisma client
│   │   ├── scoring.ts         # Thuật toán tính Viral & Opportunity Score
│   │   └── seed-data.ts       # Dữ liệu mẫu thực tế tại Việt Nam
│   └── types/
│       └── index.ts           # Type definitions TypeScript
├── tests/
│   └── scoring.test.mjs       # Unit tests kiểm thử thuật toán tính điểm
├── .env                       # Cấu hình môi trường
├── .env.example               # Mẫu cấu hình môi trường
└── package.json
```

---

## 💻 Hướng dẫn cài đặt và chạy Local

### Yêu cầu tiên quyết
- Node.js >= 18.0.0 (khuyến nghị Node 20 hoặc 24).
- npm >= 9.0.0.

### Bước 1: Cài đặt Dependencies
```bash
npm install
```

### Bước 2: Thiết lập Cơ sở dữ liệu
Khởi tạo database SQLite với Prisma:
```bash
npx prisma db push
```

### Bước 3: Chạy Unit Tests
Kiểm tra tính chính xác của các công thức tính điểm:
```bash
node --test tests/scoring.test.mjs
```

### Bước 4: Chạy ứng dụng
- **Chế độ Development**:
  ```bash
  npm run dev
  ```
- **Chế độ Production (Build & Start)**:
  ```bash
  npm run build
  npm run start
  ```

Truy cập ứng dụng tại: `http://localhost:3000`

---

## 🧪 Thử nghiệm nhanh với Bộ dữ liệu mẫu

1. Khi mở ứng dụng lần đầu, nhấn nút **"Tải mẫu"** ở góc phải thanh TopNav hoặc trên Dashboard.
2. Hệ thống sẽ tự động nạp:
   - 4 danh mục chuẩn: Đồ dùng học tập, Phụ kiện công nghệ, Đồ dùng phòng trọ, Chăm sóc cá nhân.
   - 5 sản phẩm affiliate thực tế (Đèn học tích điện Baseus, Giá đỡ laptop nhôm Orico, Kệ mini để bàn, Bàn phím cơ không dây, Bình giữ nhiệt inox 316).
   - 4 bài viết Threads thực tế tại Việt Nam kèm bình luận công khai.
   - Tự động chạy quy trình AI đối chiếu sản phẩm với kết quả chính xác 100%.
3. Bạn có thể xóa dữ liệu mẫu bất cứ lúc nào bằng nút Thùng rác bên cạnh để nhập dữ liệu thực tế của riêng mình.

---

## 🔒 Báo cáo tính minh bạch & Kết nối dịch vụ bên ngoài

- **Trạng thái Meta Threads API**: 
  - Nếu chưa có Access Token từ Meta Developer Portal, hệ thống hiển thị rõ ràng trạng thái: `Chưa cấu hình API Meta / Chế độ nhập thủ công & Dữ liệu mẫu`.
  - Hệ thống **tuyệt đối không giả mạo** việc quét dữ liệu nếu chưa kết nối API thật.
  - Người dùng có thể dễ dàng dán link bài viết Threads bất kỳ để phân tích mà không cần cấp quyền tài khoản.
- **Trạng thái AI Provider**:
  - Mặc định hệ thống sử dụng **Local Heuristic Engine** với bộ từ vựng và quy tắc ngữ nghĩa tiếng Việt sâu sắc, đảm bảo hoạt động độc lập không phụ thuộc mạng.
  - Người dùng có thể thêm khóa Google Gemini hoặc OpenAI trong trang Cài đặt. Khóa được mã hóa và lưu trữ độc quyền ở phía server, không bao giờ lộ ra frontend.

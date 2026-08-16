# Hướng dẫn chọn hạ tầng: Database, Object Storage, Server

Bối cảnh: tự vận hành nhiều dự án nhỏ (kiểu app booking), mỗi dự án bắt đầu từ
0 người dùng, một số sẽ lớn lên có khách thật. Mục tiêu: rẻ ở giai đoạn thử
nghiệm, không phải đổi hạ tầng khi dự án nào đó thật sự chạy.

## 1. Database

### So sánh

| | Free tier | Giá vào | Mạnh nhất | Yếu nhất |
|---|---|---|---|---|
| **Neon** | 100 project, mỗi project 0.5GB + 100 compute-hours riêng, scale-to-zero tự động | $0.106/CU-hour, không phí tối thiểu | Nhiều project song song không tranh tài nguyên, rẻ khi mở rộng | Backup/restore phải tự bật, không tự động kèm sẵn |
| **Supabase** | Chỉ 2 project, 500MB, 5GB egress | $25/tháng (Pro) | Bundle sẵn Auth+Storage+DB, backup 7 ngày tự động không cần cấu hình | Giới hạn 2 project ở free; giá compute leo nhanh khi cần nhiều RAM (Micro $10 → Medium $60) |
| **Prisma Postgres** | "50 databases" nhưng CHUNG 1 project, chung đúng 500MB + 100k operations | $10/tháng (Starter) | Studio chạy sẵn trên web, giá/operation giảm dần theo tier | Giá storage đắt gấp 8-16 lần Neon/Supabase |
| **Tự host (Docker/VPS)** | Không giới hạn, chỉ tốn tiền VPS | Giá VPS | Rẻ nhất, toàn quyền kiểm soát | **Không có backup tự động** — phải tự script `pg_dump` + đẩy lên object storage |

### Quyết định theo giai đoạn

- **Thử nghiệm nhiều ý tưởng, chưa có khách thật** → **Neon free**. Mở bao nhiêu
  project cũng được, mỗi cái có tài nguyên riêng, không cần thẻ tín dụng.
- **Một dự án bắt đầu có khách đặt chỗ/giao dịch thật** → bắt buộc phải có
  backup đáng tin cậy tại đây (mất dữ liệu đặt chỗ = thiệt hại kinh doanh thật,
  không chỉ là bug). Hai lựa chọn:
  - Tự cấu hình restore trên Neon (`$0.20/GB-tháng`, phải chủ động bật), hoặc
  - Chuyển riêng dự án đó sang **Supabase Pro** — backup 7 ngày có sẵn, không
    phải nghĩ tới.
- Không cần áp 1 giải pháp cho toàn bộ — chỉ dự án nào chạm "tiền thật, khách
  thật" mới cần nâng cấp độ an toàn.

## 2. Object Storage (ảnh, video)

**Không bao giờ lưu file trong Postgres hay đĩa VPS** — phình database, không
CDN, VPS chết là mất file.

| | Storage | Egress | Ghi chú |
|---|---|---|---|
| **Cloudflare R2** | $0.015/GB | **$0** | Khuyên dùng — app nhiều ảnh (phòng, địa điểm...) bị xem lại nhiều lần, egress mới là khoản tốn tiền thật, không phải dung lượng lưu |
| Backblaze B2 | $0.006/GB (rẻ nhất) | $0 nếu serve qua Cloudflare CDN, ngược lại $0.01/GB | Rẻ hơn R2 về lý thuyết nhưng phải tự nối thêm CDN |
| AWS S3 / GCS | ~$0.02/GB | ~$0.09-0.12/GB | Egress đắt, tránh cho app nhiều ảnh/video |
| Supabase Storage / Prisma Buckets | Bundled theo gói DB | Tính chung vào pool egress của DB (Supabase) / không công khai (Prisma) | Dùng chung pool egress với DB — rủi ro làm cạn quota DB nhanh hơn |

**Chọn: Cloudflare R2**, tách hoàn toàn khỏi DB, dù DB đặt ở Neon/Supabase/tự
host nào cũng dùng chung được.

### Object storage trong nước (Việt Nam)

| Nhà cung cấp | Giá storage | Ghi chú |
|---|---|---|
| **vHost** | ~480đ/GB/tháng (≈ $0.019/GB) | Gần bằng giá R2, kèm **miễn phí 1TB băng thông** — quá 1TB thì cần hỏi thêm |
| **VNDATA** | Từ ~500đ/GB/tháng (≈ $0.02/GB) | S3-compatible |
| **FPT S3 Storage** | ~1.000đ/GB/tháng cho gói lưu trữ lạnh (≈ $0.04/GB) | Đắt hơn R2 ~2.7 lần, hướng doanh nghiệp |
| **Vietnix S3, PA Vietnam** | Chưa có giá công khai rõ ràng | S3-compatible, cần liên hệ trực tiếp |

Điểm khác biệt so với R2: các hãng trong nước có server đặt tại Việt Nam nên
**độ trễ thấp hơn khi phục vụ chính người dùng Việt Nam** trực tiếp từ origin
(không qua cache). Nhưng R2 dùng mạng CDN của Cloudflare — vốn cũng có điểm
edge tại Việt Nam — nên với ảnh/video được cache, tốc độ thực tế cho người
dùng cuối thường không chênh lệch nhiều. Egress $0 của R2 vẫn khó hãng nội địa
nào địch lại được ở dung lượng lớn, trừ vHost (miễn phí 1TB — cần tính xem có
đủ hay không cho quy mô dự án).

Nguồn: [Vietnix S3 Object Storage](https://vietnix.vn/s3-object-storage/),
[vHost Object Storage](https://vhost.vn/cloud/object-storage/),
[FPT S3 Storage](https://cloudfpt.com.vn/dich-vu/fpt-s3-storage/)

## 3. Server (chạy app Next.js)

⚠️ Bảng dưới đã sửa lại theo **giá thật kiểm tra trực tiếp trên trang/giỏ hàng
của từng hãng** (trước đó có bản nháp dùng số liệu tổng hợp từ tìm kiếm, bị
sai vì gói rẻ nhất đang hết hàng / không phải giá vào cửa thật).

| | Giá thật (2 vCPU/2GB) | Bandwidth kèm | Ghi chú |
|---|---|---|---|
| **Hetzner** (Regular Performance) | **€11.99/tháng** (~330.000đ) — gói rẻ hơn €5.99 đang **hết hàng** | Chỉ **0.5TB** kèm sẵn, thêm €1/TB (rất rẻ theo GB nhưng phần free nhỏ) | Giá kiểm tra trực tiếp trên hetzner.com/cloud, không phải €5.99 như tìm kiếm ban đầu |
| **Vietnix** (VPS SSD 1) | **~178.000đ/tháng** (12 tháng, chưa VAT) / ~196.000đ có VAT | Không giới hạn dung lượng, nhưng **tốc độ**: 200Mbps trong nước, chỉ **10Mbps outbound quốc tế** | Giá lấy trực tiếp từ giỏ hàng thật portal.vietnix.vn |
| DigitalOcean | ~$24/tháng (~610.000đ) | 2TB, sau đó $0.01/GB | Hệ sinh thái đầy đủ (Managed DB, Spaces, App Platform) cùng 1 dashboard |

**Kết luận đã sửa: Vietnix rẻ hơn Hetzner ~1.7-2 lần** ở giá thật hiện tại
(178.000đ so với ~330.000đ), lại còn nhỉnh hơn về cấu hình (2 vCPU so với 1
vCPU ở mức giá rẻ nhất Hetzner). Đây là điều ngược lại với khuyến nghị ban đầu
của tôi — bài học: **luôn kiểm tra giá thật trên trang/giỏ hàng trước khi
quyết, đừng tin số liệu tổng hợp từ tìm kiếm chung chung.**

**Lưu ý riêng cho Vietnix**: outbound quốc tế chỉ 10Mbps — nếu server cần gọi
nhiều API nước ngoài (Stripe, OpenAI, Google...) hoặc phục vụ user ngoài Việt
Nam, tốc độ này có thể là điểm nghẽn. Nếu vậy nên hỏi thẳng Vietnix về gói có
outbound quốc tế cao hơn, hoặc cân nhắc Hetzner dù đắt hơn.

### VPS trong nước khác (Việt Nam)

Ngoài Vietnix (đã kiểm chứng giá thật ở trên), một số hãng khác cùng nhóm:

| Nhà cung cấp | Đặc điểm | Hợp với |
|---|---|---|
| **Viettel IDC** | Datacenter chuẩn Tier III, ổn định nhất trong nhóm | Hệ thống cần độ tin cậy cao (tài chính, tổ chức lớn) |
| **FPT Cloud** | 1 trong "4 trụ cột" hạ tầng cloud nội địa (cùng Viettel, VNG, CMC) | Doanh nghiệp/ngân hàng — giá cao hơn mặt bằng chung, không hợp startup nhỏ |
| **VNG Cloud / CMC Cloud** | Cũng thuộc nhóm "4 trụ cột", tương tự FPT Cloud | Doanh nghiệp vừa/lớn |
| **AZDIGI / TinoHost** | Rẻ nhất trong nhóm, từ ~43.000-55.000đ/tháng | Dự án nhỏ, ngân sách hạn chế, chấp nhận hỗ trợ cơ bản hơn |

⚠️ Giá các hãng này (trừ Vietnix) **chưa được kiểm chứng trực tiếp** như
Hetzner/Vietnix ở trên — chỉ mang tính tham khảo, nên tự vào giỏ hàng kiểm tra
trước khi quyết, đúng như bài học rút ra ở trên.

Nguồn: [TND — so sánh VPS Việt Nam 2026](https://www.tnd.vn/top-vps-viet-nam-gia-re-2026-so-sanh-7-nha-cung-cap-12925/),
[AZDIGI Blog](https://azdigi.com/blog/kien-thuc-vps/top-nha-cung-cap-vps-viet-nam),
giá Hetzner/Vietnix lấy trực tiếp từ hetzner.com/cloud và portal.vietnix.vn (chụp màn hình thực tế)

## Tổng kết: bộ hạ tầng đề xuất

```
Server:   Vietnix VPS SSD 1 (rẻ hơn Hetzner ~2 lần ở giá thật, xem lưu ý outbound
          quốc tế 10Mbps) — chạy Next.js qua Docker Compose / scripts/deploy-vps.sh
Database: Neon (free lúc thử nghiệm) → thêm backup hoặc chuyển Supabase Pro
          khi dự án có khách thật
Storage:  Cloudflare R2 (ảnh/video, tách riêng khỏi DB ngay từ đầu)
```

Xem thêm [HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md](./HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md)
để biết cách xem/quản lý dữ liệu trên các database này, và
[HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md](./HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md)
để biết cách deploy nhiều dự án trên cùng 1 VPS.

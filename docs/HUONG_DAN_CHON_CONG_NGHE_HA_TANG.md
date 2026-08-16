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

| | Giá vào (2 vCPU/2-4GB) | Bandwidth kèm | Điểm mạnh |
|---|---|---|---|
| **Hetzner** | **$4.56/tháng** | **20 TB/tháng** | Rẻ hơn 3-5 lần, giữ tỉ lệ đó xuyên suốt mọi cấu hình (không chỉ gói rẻ nhất) |
| DigitalOcean | ~$24/tháng | 2TB, sau đó $0.01/GB | Hệ sinh thái đầy đủ (Managed DB, Spaces, App Platform) cùng 1 dashboard, nhiều tutorial hơn |
| Vultr | Cạnh tranh sát Hetzner | Ít hơn Hetzner | Phủ sóng địa lý rộng hơn ở châu Á |

**Chọn: Hetzner** — rẻ hơn hẳn ở mọi quy mô, 20TB bandwidth miễn phí đủ dùng
lâu dài. Kiểm tra độ trễ (ping) từ Việt Nam tới region Singapore của Hetzner
trước khi cam kết; nếu độ trễ không ổn thì chuyển sang Vultr (giá vẫn cạnh
tranh, phủ sóng châu Á tốt hơn).

Chỉ chọn DigitalOcean nếu muốn gộp server + database managed + object storage
vào đúng 1 hãng, 1 hoá đơn cho dễ quản lý — đổi lại trả nhiều hơn hẳn.

### VPS trong nước (Việt Nam)

Giá trị của nhóm này **không phải rẻ hơn Hetzner** — mà là **độ trễ thấp** (ping
dưới 10ms từ các thành phố lớn, so với Hetzner Singapore hay Hetzner EU) và
tuân thủ quy định lưu trữ dữ liệu trong nước nếu ngành nghề yêu cầu (tài
chính, dữ liệu cá nhân theo Nghị định 13).

| Nhà cung cấp | Đặc điểm | Hợp với |
|---|---|---|
| **Viettel IDC** | Datacenter chuẩn Tier III, ổn định nhất trong nhóm | Hệ thống cần độ tin cậy cao (tài chính, tổ chức lớn) |
| **FPT Cloud** | 1 trong "4 trụ cột" hạ tầng cloud nội địa (cùng Viettel, VNG, CMC) | Doanh nghiệp/ngân hàng — giá cao hơn mặt bằng chung, không hợp startup nhỏ |
| **VNG Cloud / CMC Cloud** | Cũng thuộc nhóm "4 trụ cột", tương tự FPT Cloud | Doanh nghiệp vừa/lớn |
| **Vietnix** | Thương hiệu quen thuộc, giá vừa phải | Startup/dự án vừa, cân bằng giá và độ tin cậy |
| **AZDIGI / TinoHost** | Rẻ nhất trong nhóm, từ ~43.000-55.000đ/tháng | Dự án nhỏ, ngân sách hạn chế, chấp nhận hỗ trợ cơ bản hơn |

**Khi nào chọn VPS Việt Nam thay vì Hetzner**: nếu đo thử ping từ Hetzner
Singapore về vẫn cao, hoặc dự án thuộc ngành bắt buộc lưu dữ liệu người dùng
Việt Nam trong nước. Dự án thử nghiệm/MVP thông thường thì Hetzner vẫn rẻ hơn
đáng kể và đủ nhanh với đa số người dùng.

Nguồn: [TND — so sánh VPS Việt Nam 2026](https://www.tnd.vn/top-vps-viet-nam-gia-re-2026-so-sanh-7-nha-cung-cap-12925/),
[AZDIGI Blog](https://azdigi.com/blog/kien-thuc-vps/top-nha-cung-cap-vps-viet-nam)

## Tổng kết: bộ hạ tầng đề xuất

```
Server:   Hetzner (VPS chạy Next.js qua Docker Compose / scripts/deploy-vps.sh)
Database: Neon (free lúc thử nghiệm) → thêm backup hoặc chuyển Supabase Pro
          khi dự án có khách thật
Storage:  Cloudflare R2 (ảnh/video, tách riêng khỏi DB ngay từ đầu)
```

Xem thêm [HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md](./HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md)
để biết cách xem/quản lý dữ liệu trên các database này, và
[HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md](./HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md)
để biết cách deploy nhiều dự án trên cùng 1 VPS.

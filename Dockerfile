# Ảnh Debian slim thay vì Alpine: Prisma cần OpenSSL và engine dựng sẵn cho
# glibc. Trên Alpine (musl) phải khai báo thêm binaryTargets và vẫn hay gặp lỗi
# thiếu engine lúc chạy. Vài chục MB đổi lấy việc build luôn chạy được.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — cài dependency. Tách riêng để layer cache chỉ vỡ khi lockfile đổi.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# prisma.config.ts là bắt buộc từ Prisma 7: `postinstall` chạy `prisma generate`,
# mà lệnh đó nạp file config này để biết schema nằm ở đâu.
COPY prisma.config.ts ./
COPY prisma ./prisma/
# Config đọc DATABASE_URL ngay lúc nạp. `generate` không hề kết nối database,
# nhưng vẫn cần biến tồn tại — nên đặt giá trị giả CHỈ cho bước build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Cố tình KHÔNG dùng `--mount=type=cache`: nó bắt buộc phải có BuildKit, mà
# BuildKit lại cần plugin buildx — không phải máy nào cũng có (Colima chẳng
# hạn). Layer cache theo package.json + lockfile đã đủ nhanh cho hầu hết thay đổi.
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder — build Next.js
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Lúc build không có secret thật, và cũng không cần: không dòng code nào đọc
# giá trị env ở thời điểm này. Bỏ qua validation để build không đòi .env.
ENV SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm db:generate && pnpm build

# ---------------------------------------------------------------------------
# migrator — image một-lần-chạy để apply migration trước khi web khởi động.
# Image runtime không có Prisma CLI nên cần stage riêng.
# ---------------------------------------------------------------------------
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# Cố tình KHÔNG kế thừa DATABASE_URL giả của stage deps: stage này chạy thật,
# nên thiếu biến phải báo lỗi ngay chứ không được âm thầm trỏ vào localhost.
COPY prisma.config.ts ./
COPY prisma ./prisma/
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runner — image production, chỉ chứa output standalone
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    # server.js của standalone mặc định bind vào localhost. Trong container
    # điều đó nghĩa là không nhận được request nào từ bên ngoài.
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Không chạy bằng root: một lỗ RCE trong app không kéo theo quyền root container.
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

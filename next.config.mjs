/**
 * Header bảo mật tĩnh, áp cho mọi response.
 *
 * Content-Security-Policy KHÔNG nằm ở đây: nó cần nonce sinh riêng theo từng
 * request nên được set trong `src/middleware.ts`.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  // Không quảng cáo framework đang chạy phía sau.
  poweredByHeader: false,

  // <Link href="..."> được typecheck theo route thật sự tồn tại.
  typedRoutes: true,

  /*
   * Vá lỗi truy vết file của Next 16.3.1 khi dùng pnpm.
   *
   * Bản standalone chỉ chép thư mục `cjs/` của @swc/helpers, trong khi runtime
   * lại nạp `esm/_interop_require_default.js`. Hậu quả rất khó chịu: `pnpm
   * build` xanh, image Docker build xong, nhưng container vừa khởi động là
   * chết ngay với MODULE_NOT_FOUND — lỗi chỉ lộ ra khi CHẠY THẬT.
   *
   * Bỏ dòng này ra được khi Next vá lỗi tracing. Cách kiểm tra: xoá đi, chạy
   * `pnpm build && node .next/standalone/server.js`, thấy server lên là đã vá.
   */
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**"],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

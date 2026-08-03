"use client";

/**
 * Bắt lỗi xảy ra ngay trong root layout — trường hợp `error.tsx` không cứu
 * được, vì lúc đó layout chưa render xong. Phải tự render <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "#f8fafc",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: 12 }}>Ứng dụng gặp sự cố nghiêm trọng</h1>
          {error.digest && (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: 20 }}>
              Mã lỗi: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#6366f1",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tải lại
          </button>
        </div>
      </body>
    </html>
  );
}

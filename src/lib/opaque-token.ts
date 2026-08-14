import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token mờ (opaque token): chuỗi ngẫu nhiên không mang thông tin, chỉ có giá
 * trị khi tra được trong database.
 *
 * Dùng cho refresh token và cho token gửi qua email (xác thực địa chỉ, đặt lại
 * mật khẩu). Khác với JWT ở một điểm quyết định: JWT đã ký thì không thu hồi
 * được, còn token mờ thì xoá dòng trong database là mất hiệu lực ngay.
 *
 * ---
 * VÌ SAO BĂM SHA-256 CHỨ KHÔNG PHẢI ARGON2
 *
 * Argon2 được thiết kế chậm có chủ đích, để chống dò mật khẩu do con người
 * nghĩ ra — vốn có entropy thấp. Token ở đây là 32 byte ngẫu nhiên từ nguồn
 * mã hoá, không gian tìm kiếm 2^256, không có gì để dò. Băm chậm chỉ làm mỗi
 * request tốn thêm thời gian mà không tăng thêm chút an toàn nào.
 *
 * Điều thực sự cần là: database bị rò thì token trong đó không dùng lại được,
 * và tra cứu phải đi qua index. SHA-256 đáp ứng cả hai.
 */

/** 32 byte = 256 bit entropy. Đủ để không ai dò trúng. */
const TOKEN_BYTES = 32;

/** Sinh token mới. Chuỗi trả về chỉ tồn tại trong bộ nhớ — không bao giờ lưu. */
export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Dạng lưu trong database. Luôn băm trước khi ghi, và trước khi tra cứu. */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * So sánh hai chuỗi băm theo thời gian không đổi.
 *
 * Chỉ cần khi so sánh thủ công. Tra cứu bằng `where: { tokenHash }` không cần
 * hàm này — database đối chiếu qua index, không phải trong mã ứng dụng.
 */
export function safeEqualHash(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  // timingSafeEqual ném lỗi khi độ dài khác nhau — mà chính việc ném lỗi đó đã
  // làm lộ thông tin. Chặn trước bằng phép so sánh độ dài, vốn không bí mật.
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

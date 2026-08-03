import { compare, hash } from "bcryptjs";

/**
 * Cost factor của bcrypt. 12 ≈ 250ms trên phần cứng server hiện nay — đủ chậm
 * để brute-force offline trở nên đắt, đủ nhanh để không ảnh hưởng UX đăng nhập.
 * Giá trị cũ (10) đã dưới mức khuyến nghị của OWASP.
 */
const BCRYPT_COST = 12;

/**
 * Hash dùng cho phép so sánh giả. Tính một lần rồi cache lại.
 *
 * Không có nó, "email không tồn tại" trả về nhanh hơn hẳn "sai mật khẩu", và
 * kẻ tấn công đo thời gian phản hồi là dò ra được email nào đã đăng ký.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash("timing-attack-placeholder", BCRYPT_COST);
  return dummyHashPromise;
}

export const CryptoUtils = {
  hashPassword(password: string): Promise<string> {
    return hash(password, BCRYPT_COST);
  },

  comparePassword(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  },

  /** Đốt lượng thời gian tương đương một lần so sánh thật. */
  async fakeCompare(password: string): Promise<void> {
    await compare(password, await getDummyHash());
  },
};

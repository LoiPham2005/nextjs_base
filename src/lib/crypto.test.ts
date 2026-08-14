import { describe, expect, it } from "vitest";
import { hash as argon2Hash } from "@node-rs/argon2";
import { hash as bcryptHash } from "bcryptjs";
import { CryptoUtils } from "./crypto";

/**
 * Băm thật, không mock. Đây là lớp bảo vệ mật khẩu — mock đi thì test chỉ
 * chứng minh rằng mock hoạt động.
 *
 * Argon2id cố tình chậm (19 MiB, 2 lượt), nên các test dưới đây tốn vài chục
 * mili giây mỗi lần băm. Đó là cái giá đúng phải trả.
 */

const PASSWORD = "mat-khau-du-dai-de-test";

describe("hashPassword", () => {
  it("sinh hash Argon2id với đúng tham số khuyến nghị", async () => {
    const hashed = await CryptoUtils.hashPassword(PASSWORD);

    expect(hashed.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
  });

  it("hai lần băm cùng một mật khẩu cho hai kết quả khác nhau", async () => {
    // Salt ngẫu nhiên. Nếu hai hash giống nhau nghĩa là salt bị cố định — lúc
    // đó một bảng tra cứu dựng sẵn sẽ phá được toàn bộ kho mật khẩu.
    const a = await CryptoUtils.hashPassword(PASSWORD);
    const b = await CryptoUtils.hashPassword(PASSWORD);

    expect(a).not.toBe(b);
  });
});

describe("verifyPassword — hash Argon2id", () => {
  it("chấp nhận mật khẩu đúng và không đòi băm lại", async () => {
    const hashed = await CryptoUtils.hashPassword(PASSWORD);

    expect(await CryptoUtils.verifyPassword(PASSWORD, hashed)).toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("từ chối mật khẩu sai", async () => {
    const hashed = await CryptoUtils.hashPassword(PASSWORD);
    const result = await CryptoUtils.verifyPassword("sai-mat-khau", hashed);

    expect(result.valid).toBe(false);
  });

  it("đòi băm lại khi hash dùng tham số cũ", async () => {
    // Tham số yếu hơn mức đang dùng — mô phỏng hash sinh ra từ cấu hình trước.
    const weakHash = await argon2Hash(PASSWORD, {
      algorithm: 2,
      memoryCost: 8192,
      timeCost: 1,
      parallelism: 1,
    });

    expect(await CryptoUtils.verifyPassword(PASSWORD, weakHash)).toEqual({
      valid: true,
      needsRehash: true,
    });
  });
});

describe("verifyPassword — tương thích ngược với bcrypt", () => {
  it("vẫn chấp nhận hash bcrypt cũ", async () => {
    // Nếu test này hỏng, mọi tài khoản tạo trước khi chuyển sang Argon2id sẽ
    // mất quyền đăng nhập vĩnh viễn — không có cách nào chuyển đổi hash mà
    // không biết mật khẩu gốc.
    const legacy = await bcryptHash(PASSWORD, 10);
    const result = await CryptoUtils.verifyPassword(PASSWORD, legacy);

    expect(result.valid).toBe(true);
  });

  it("luôn đòi băm lại sau khi xác thực thành công bằng bcrypt", async () => {
    const legacy = await bcryptHash(PASSWORD, 10);
    const result = await CryptoUtils.verifyPassword(PASSWORD, legacy);

    // Đây là cơ chế chuyển dần kho mật khẩu: mỗi lần đăng nhập đúng là một
    // bản ghi được nâng cấp sang Argon2id.
    expect(result.needsRehash).toBe(true);
  });

  it("từ chối mật khẩu sai trên hash bcrypt", async () => {
    const legacy = await bcryptHash(PASSWORD, 10);
    const result = await CryptoUtils.verifyPassword("sai-mat-khau", legacy);

    expect(result).toEqual({ valid: false, needsRehash: false });
  });
});

describe("verifyPassword — dữ liệu hỏng", () => {
  it("trả về không hợp lệ thay vì ném lỗi khi hash là rác", async () => {
    // Một bản ghi hỏng trong database phải dẫn tới "sai mật khẩu", không phải
    // lỗi 500 — lỗi 500 nói cho kẻ tấn công biết bản ghi đó có gì bất thường.
    for (const garbage of ["", "khong-phai-hash", "$argon2id$hong", "$2a$khong-hop-le"]) {
      const result = await CryptoUtils.verifyPassword(PASSWORD, garbage);
      expect(result.valid, `hash rác: ${garbage}`).toBe(false);
    }
  });
});

describe("fakeCompare", () => {
  it("chạy được và không ném lỗi", async () => {
    await expect(CryptoUtils.fakeCompare("bat-ky-chuoi-nao")).resolves.toBeUndefined();
  });
});

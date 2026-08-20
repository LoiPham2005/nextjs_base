import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

/**
 * Gắn phương thức `.openapi()` vào Zod. Module này CHỈ có side effect.
 *
 * ---
 * VÌ SAO PHẢI TÁCH RA MỘT FILE RIÊNG
 *
 * `extendZodWithOpenApi(z)` phải chạy TRƯỚC khi bất kỳ schema nào được tạo.
 * Đặt lời gọi đó trong thân `registry.ts` là quá muộn: câu lệnh `import` được
 * đánh giá trước thân module, nên toàn bộ schema trong `src/schemas/*.ts` đã
 * hình thành xong trước khi dòng `extendZodWithOpenApi(z)` kịp chạy.
 *
 * Hậu quả rất khó đoán: `registry.register("User", userSchema)` ném
 * `zodSchema.openapi is not a function`, trong khi cùng dòng đó với một schema
 * viết inline lại chạy bình thường — vì schema inline được tạo SAU.
 *
 * Tách thành module riêng rồi import nó ở DÒNG ĐẦU TIÊN của `registry.ts` thì
 * thứ tự được bảo đảm: import được đánh giá theo đúng thứ tự khai báo.
 *
 * ⚠️ Đừng gộp file này trở lại vào `registry.ts`, và đừng để công cụ sắp xếp
 * import tự đẩy nó xuống dưới — cả hai đều làm lỗi trên quay lại.
 */
extendZodWithOpenApi(z);

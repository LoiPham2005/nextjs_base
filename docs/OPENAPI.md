# Hướng dẫn sử dụng OpenAPI, Scalar UI & Code Generation cho Mobile (Flutter / Dart)

Tài liệu này hướng dẫn cách truy cập, xem tài liệu trực quan trên Web, Import vào Postman và **Tự động sinh mã nguồn (Code Gen) trọn gói cho Flutter/Dart** từ chuẩn **OpenAPI 3.1** của dự án.

---

## 1. Đường dẫn Endpoint OpenAPI & Docs

Khi ứng dụng đang chạy (`pnpm dev` hoặc `make dev`):

- **Trang giao diện trực quan (Dành cho Người xem & Test API trực tiếp):**  
  👉 `http://localhost:3000/docs` _(Giao diện Scalar UI hiện đại, mượt mà, hỗ trợ Dark/Light Mode)_
- **OpenAPI JSON Spec (Dành cho Postman / Tool Code Gen):**  
  👉 `http://localhost:3000/api/v1/openapi.json`
- **File sinh đặc tả từ Backend:** `src/lib/openapi/registry.ts` _(Tự động đồng bộ 100% với Zod Schema trong `src/schemas/*.ts`)_

---

## 2. Cách xem và kiểm thử nhanh (Test API)

### Cách 1: Xem và gọi thử trực tiếp trên Web (`/docs`)

1. Mở trình duyệt vào `http://localhost:3000/docs`.
2. Chọn bất kỳ API nào (ví dụ: `POST /api/v1/auth/login`).
3. Bấm **"Test Request"** / **"Send"** để gửi request trực tiếp trên trình duyệt.

---

### Cách 2: Import vào Postman / Insomnia (1 Click)

1. Mở **Postman** hoặc **Insomnia**.
2. Chọn nút **Import** ở góc trên bên trái.
3. Chọn tab **Link / URL** và dán:
   ```text
   http://localhost:3000/api/v1/openapi.json
   ```
4. Bấm **Import**. Postman sẽ tự động tạo một Collection gồm đầy đủ:
   - Toàn bộ danh sách Endpoint kèm HTTP Method (`GET`, `POST`, `PATCH`, `DELETE`).
   - Request Body mẫu (đầy đủ các trường validate bởi Zod).
   - Header `Authorization: Bearer <token>`.
   - Danh sách Status Code và Error response (`401`, `403`, `422`, `500`).

---

## 3. Hướng dẫn chi tiết: Tự động sinh mã nguồn (Code Gen) cho Flutter / Dart

Bạn không cần phải viết tay các file Model (`User`, `LoginResponse`...) hay API Services trong Flutter. Hãy để công cụ tự động sinh từ file `openapi.json`.

### Bước 1: Mở Terminal tại thư mục dự án Flutter của bạn

Đảm bảo bạn đang đứng ở thư mục gốc của dự án Flutter (nơi có file `pubspec.yaml`).

#### ⚠️ Đặt code sinh ra ở `packages/`, KHÔNG phải trong `lib/`

Với `--additional-properties=pubName=api_client`, generator **không sinh ra vài
file lẻ** — nó sinh ra một **package Dart hoàn chỉnh**, có `pubspec.yaml`,
`analysis_options.yaml`, `.gitignore` và `test/` riêng.

Một package có `pubspec.yaml` riêng nằm bên trong `lib/` là sai về cấu trúc, và
hỏng theo cách rất cụ thể: `flutter pub get` **không** cài dependency khai báo
trong pubspec lồng nhau. Package sinh ra cần `built_value`, `built_collection`,
`one_of` — muốn code trong `lib/` chạy được, bạn buộc phải thêm cả ba vào
pubspec của ỨNG DỤNG, tức là trộn thẳng một bộ thư viện của thư viện con vào
danh sách dependency của app.

Cách đúng — để nó là một package thật, khai báo bằng path dependency:

```
your_flutter_app/
├── lib/              ← code của bạn
├── packages/
│   └── api_client/   ← code sinh ra, KHÔNG sửa tay
└── pubspec.yaml
```

```yaml
# pubspec.yaml của app
dependencies:
  api_client:
    path: packages/api_client
```

Lợi ích kèm theo: dependency riêng của client (`built_value`, `one_of`) nằm gọn
trong package con, không lẫn vào app; và sinh lại code chỉ cần xoá đúng một thư
mục, không sợ xoá nhầm code tay.

### Bước 2: Chạy lệnh sinh Code (Dùng `openapi-generator-cli`)

#### ⚠️ Điều kiện tiên quyết: máy phải có Java 11 trở lên

`@openapitools/openapi-generator-cli` **không phải** công cụ Node. Nó chỉ là lớp
vỏ mỏng bọc quanh một file JAR viết bằng Java — gói npm chỉ lo tải JAR về rồi
gọi `java -jar`. Thiếu Java thì lệnh chết ngay, và thông báo lỗi thường không
nói thẳng ra điều đó.

Kiểm tra trước:

**Trên Windows (CMD / PowerShell / Dùng `pnpm dlx`):**

```cmd
pnpm dlx @openapitools/openapi-generator-cli generate -i http://localhost:3000/api/v1/openapi.json -g dart-dio -o ./lib/core/api_client --additional-properties=pubName=api_client
```

**Trên Linux / macOS (Dùng `npx` hoặc `pnpm dlx`):**

```bash
java -version
```

Chưa có thì cài:

| Hệ điều hành | Lệnh cài                                   |
| ------------ | ------------------------------------------ |
| macOS        | `brew install openjdk@21`                  |
| Windows      | `winget install Microsoft.OpenJDK.21`      |
| Ubuntu       | `sudo apt install openjdk-21-jre-headless` |

#### Cách chắc chắn nhất: viết lệnh trên MỘT dòng

Cách này chạy được ở **mọi** shell — macOS, Linux, PowerShell, CMD — vì nó
không dùng ký tự nối dòng nào cả. Nếu bạn chỉ muốn lệnh chạy được và không
quan tâm nó dài, dùng cách này:

**Dùng `Dio`** (khuyên dùng cho Flutter):

```bash
pnpm dlx @openapitools/openapi-generator-cli generate -i http://localhost:3000/api/v1/openapi.json -g dart-dio -o ./packages/api_client --additional-properties=pubName=api_client
```

**Dùng `http` chuẩn của Dart:**

```bash
pnpm dlx @openapitools/openapi-generator-cli generate -i http://localhost:3000/api/v1/openapi.json -g dart -o ./packages/api_client
```

#### Muốn xuống dòng cho dễ đọc: ký tự nối dòng KHÁC nhau theo shell

Đây là nguyên nhân phổ biến nhất khiến lệnh copy từ tài liệu Linux dán vào
Windows thì hỏng. Dấu `\` chỉ có ý nghĩa nối dòng trong bash/zsh; PowerShell và
CMD dùng ký tự khác, nên khi dán vào chúng, lệnh bị vỡ thành nhiều mảnh rời rạc
và shell báo lỗi ở chỗ trông chẳng liên quan gì.

| Shell                                   | Ký tự nối dòng     |
| --------------------------------------- | ------------------ |
| bash / zsh (macOS, Linux, **Git Bash**) | `\`                |
| PowerShell                              | `` ` `` (backtick) |
| CMD (`cmd.exe`)                         | `^`                |

**macOS / Linux / Git Bash:**

```bash
pnpm dlx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -g dart-dio \
  -o ./packages/api_client \
  --additional-properties=pubName=api_client
```

**Windows PowerShell:**

```powershell
pnpm dlx @openapitools/openapi-generator-cli generate `
  -i http://localhost:3000/api/v1/openapi.json `
  -g dart-dio `
  -o ./packages/api_client `
  --additional-properties=pubName=api_client
```

⚠️ Backtick phải là ký tự **cuối cùng** của dòng. Thừa một dấu cách phía sau nó
là PowerShell không hiểu là nối dòng nữa — lỗi này rất khó nhìn ra bằng mắt.

**Windows CMD:**

```bat
pnpm dlx @openapitools/openapi-generator-cli generate ^
  -i http://localhost:3000/api/v1/openapi.json ^
  -g dart-dio ^
  -o ./packages/api_client ^
  --additional-properties=pubName=api_client
```

#### `npx` hay `pnpm dlx`?

Hai lệnh này làm cùng một việc: tải một gói về chạy tạm rồi bỏ. Tài liệu này
dùng `pnpm dlx` vì dự án đã khoá trình quản lý gói bằng trường `packageManager`
trong `package.json` — dùng nhất quán một công cụ thì bớt một thứ phải nghĩ.

Nếu `npx` báo lỗi trên Windows (đã gặp thật), đổi sang `pnpm dlx` là cách khắc
phục nhanh nhất. Ngược lại nếu máy chưa có pnpm thì `npx` vẫn dùng được:

```bash
npx @openapitools/openapi-generator-cli generate -i http://localhost:3000/api/v1/openapi.json -g dart-dio -o ./packages/api_client --additional-properties=pubName=api_client
```

#### ⚠️ `localhost` khi chạy trên máy ảo Android hoặc thiết bị thật

Lệnh sinh code ở trên chạy trên MÁY TÍNH nên `localhost` là đúng. Nhưng URL bạn
điền vào `BaseOptions(baseUrl: ...)` trong Flutter thì khác:

| Chạy ở đâu      | Địa chỉ tới máy tính của bạn   |
| --------------- | ------------------------------ |
| Máy ảo Android  | `http://10.0.2.2:3000`         |
| Máy ảo iOS      | `http://localhost:3000`        |
| Điện thoại thật | `http://<IP-LAN-của-máy>:3000` |

Với điện thoại thật, `pnpm dev` phải lắng nghe trên mọi địa chỉ:
`pnpm dev -- -H 0.0.0.0`.

---

### ⚠️ Trước khi dùng: dart-dio ép bạn dùng `built_value`, không phải `freezed`

Đây **không phải lựa chọn**. Generator `dart-dio` sinh model theo `built_value`,
chấm hết — `pubspec.yaml` của package sinh ra phụ thuộc `built_value` +
`built_collection`, và mọi model đều mang `@BuiltValue()`.

Nghĩa là nếu dự án Flutter của bạn đã dùng `freezed` + `json_serializable` (như
`flutter_base2`), thêm client này vào là có **hai hệ sinh model song song**
trong cùng một app: hai bộ annotation, hai generator, hai lần `build_runner`
chạy lâu hơn.

Cân nhắc trước khi quyết định:

|                                         | Sinh tự động (`dart-dio`)        | Viết tay (`retrofit` + `freezed`) |
| --------------------------------------- | -------------------------------- | --------------------------------- |
| Công sức ban đầu                        | Gần bằng 0                       | Mỗi endpoint vài phút             |
| Đồng bộ với backend                     | Sinh lại là xong                 | Phải tự nhớ sửa                   |
| Hệ serialization                        | `built_value` (thêm mới)         | `freezed` (đã có)                 |
| Tên class                               | Máy đặt, thường xấu              | Bạn đặt                           |
| Đi qua interceptor sẵn có               | Được, nếu truyền Dio của bạn vào | Mặc định đã đi                    |
| Chỉ dùng 5–10 endpoint                  | Thừa                             | Hợp lý                            |
| Dùng 50+ endpoint, backend đổi liên tục | Rất đáng                         | Mệt                               |

**Gợi ý:** dự án đã có `retrofit` + `freezed` và chỉ gọi vài chục endpoint thì
viết tay theo mẫu sẵn có gọn hơn. Chọn sinh tự động khi số endpoint lớn, hoặc
khi backend thay đổi thường xuyên tới mức việc tự nhớ đồng bộ là gánh nặng thật.

Dù chọn cách nào, `/docs` và `openapi.json` vẫn có giá trị: nó là hợp đồng API
luôn khớp code, dùng để tra cứu và để kiểm chứng model viết tay.

### 💡 Tên class sinh ra xấu? Sửa ở BACKEND, không phải ở Flutter

Nếu sinh code mà nhận được những cái tên như `AuthLoginPostRequest`,
`AuthMeGet200ResponseUser`, `RolesKeyPatchRequest` — đó **không phải lỗi của
generator**. Nó đang tự bịa tên vì đặc tả OpenAPI mô tả schema đó **inline**,
không đặt tên.

So sánh trong chính dự án này:

| Tên sinh ra             | Vì sao                                             |
| ----------------------- | -------------------------------------------------- |
| `ApiError`, `TokenPair` | Backend có gọi `registry.register("TokenPair", …)` |
| `AuthLoginPostRequest`  | Schema viết inline, không đăng ký tên              |

Cách sửa nằm ở `src/lib/openapi/registry.ts` — đăng ký tên cho schema:

```ts
const loginRequestSchema = registry.register("LoginRequest", loginSchema);

registry.registerPath({
  method: "post",
  path: "/auth/login",
  request: { body: { content: { "application/json": { schema: loginRequestSchema } } } },
  // …
});
```

Sinh lại là có `LoginRequest` thay vì `AuthLoginPostRequest`. Sửa một lần ở
backend, mọi client (Dart, TypeScript, Kotlin…) đều hưởng.

### Bước 3: Cài đặt Dependencies trong `pubspec.yaml` (nếu cần)

Nếu dùng `dart-dio`, thêm các package sau vào `pubspec.yaml` của Flutter:

```yaml
dependencies:
  dio: ^5.7.0
  built_value: ^8.9.2
  built_collection: ^5.1.1

dev_dependencies:
  build_runner: ^2.4.13
  built_value_generator: ^8.9.2
```

Sau đó chạy:

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

---

### Bước 4: Sử dụng trong Code Flutter

Sau khi sinh code, bạn có thể gọi API dễ dàng và có Type Safety 100%:

```dart
import 'package:your_app/core/api_client/lib/api.dart';
import 'package:dio/dio.dart';

void main() async {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api/v1'));
  final api = ApiClient(dio: dio);

  try {
    // 1. Gọi API Đăng nhập
    //
    // ⚠️ Trường là `identifier`, KHÔNG phải `email` — một ô nhận cả email lẫn
    // tên đăng nhập (xem `loginSchema` trong src/schemas/auth.schema.ts).
    // Gửi `email` thì server trả 422 và thông báo lỗi trỏ vào `identifier`.
    final response = await api.getAuthApi().authLoginPost(
      loginRequest: LoginRequestBuilder()
        ..identifier = 'dev.admin@example.com'
        ..password = 'devpassword123'
    );

    // ⚠️ HAI lớp `data`: `response.data` là body HTTP, `.data` bên trong là
    // envelope `{ data: ... }` mà API luôn bọc (xem src/lib/api/response.ts).
    final accessToken = response.data?.data.accessToken;
    print('Token: $accessToken');

    // 2. Gọi API với Bearer Token
    dio.options.headers['Authorization'] = 'Bearer $accessToken';
    final userRes = await api.getAuthApi().authMeGet();
    print('Current User: ${userRes.data?.data.user.email}');
  } catch (e) {
    print('Error calling API: $e');
  }
}
```

---

## 4. Tự động sinh TypeScript Types (Dành cho Web Client / React / Vue)

Nếu bạn có một dự án Web Frontend khác muốn dùng chung API này:

```bash
pnpm dlx openapi-typescript http://localhost:3000/api/v1/openapi.json -o ./src/types/api-schema.d.ts
```

Lệnh này chạy giống nhau ở macOS, Linux và Windows vì nó nằm gọn trên một dòng.
Khác với `openapi-generator-cli`, `openapi-typescript` là công cụ Node thuần —
**không cần Java**.

---

## 4b. Lệnh sinh code báo lỗi — tra ở đây trước

| Thông báo bạn thấy                                                           | Nguyên nhân thật                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Error: Unable to access jarfile` · `'java' is not recognized` · `JAVA_HOME` | **Chưa cài Java.** `openapi-generator-cli` là vỏ Node bọc file JAR — xem Bước 2.           |
| PowerShell: `The token '\' is not a valid statement separator`               | Dán lệnh dùng `\` của bash vào PowerShell. Đổi sang backtick, hoặc dùng bản một dòng.      |
| CMD: `'-i' is not recognized as an internal or external command`             | Cùng nguyên nhân trên, ở CMD. Đổi `\` thành `^`.                                           |
| PowerShell nối dòng vẫn lỗi dù đã dùng backtick                              | Có **dấu cách thừa** sau backtick. Nó phải là ký tự cuối dòng, không có gì phía sau.       |
| `ECONNREFUSED` · `connect ECONNREFUSED 127.0.0.1:3000`                       | Server Next chưa chạy. Bật `pnpm dev` ở một cửa sổ khác rồi thử lại.                       |
| `404` khi tải `openapi.json`                                                 | Sai đường dẫn — phải có `/v1`: `/api/v1/openapi.json`.                                     |
| Sinh code xong nhưng thiếu endpoint mới thêm                                 | Đặc tả sinh lúc chạy từ Zod schema. Khởi động lại `pnpm dev` rồi sinh lại.                 |
| Windows: `EPERM` · `path too long`                                           | Đường dẫn Windows giới hạn 260 ký tự. Chuyển dự án lên gần gốc ổ đĩa (ví dụ `C:\src\app`). |

Vẫn không được thì bỏ hẳn công cụ sinh code: mở
`http://localhost:3000/docs`, xem hợp đồng API rồi viết model bằng tay. Với một
dự án chỉ dùng vài endpoint, cách đó nhiều khi còn nhanh hơn.

---

## 5. Bảng tổng hợp các Endpoint REST API (`/api/v1/**`)

| Nhóm API     | Endpoint                            |   Quyền hạn   | Mô tả                                               |
| :----------- | :---------------------------------- | :-----------: | :-------------------------------------------------- |
| **Auth**     | `POST /api/v1/auth/register`        |    Public     | Đăng ký tài khoản mới                               |
|              | `POST /api/v1/auth/login`           |    Public     | Đăng nhập lấy access & refresh token                |
|              | `POST /api/v1/auth/refresh`         |    Public     | Cấp lại access token từ refresh token               |
|              | `GET /api/v1/auth/me`               | Bearer Token  | Lấy thông tin user hiện tại                         |
|              | `POST /api/v1/auth/change-password` | Bearer Token  | Đổi mật khẩu                                        |
|              | `POST /api/v1/auth/forgot-password` |    Public     | Yêu cầu gửi link đặt lại mật khẩu                   |
|              | `POST /api/v1/auth/reset-password`  |    Public     | Đặt lại mật khẩu với token                          |
|              | `POST /api/v1/auth/logout`          | Bearer Token  | Đăng xuất và thu hồi token                          |
| **Users**    | `GET /api/v1/users`                 |  `user:read`  | Lấy danh sách người dùng (hỗ trợ phân trang cursor) |
|              | `POST /api/v1/users`                | `user:create` | Tạo người dùng mới                                  |
|              | `GET /api/v1/users/[id]`            |  `user:read`  | Xem chi tiết người dùng                             |
|              | `DELETE /api/v1/users/[id]`         | `user:delete` | Xóa mềm người dùng                                  |
|              | `PATCH /api/v1/users/[id]/status`   | `user:update` | Khóa/Mở khóa tài khoản                              |
|              | `POST /api/v1/users/[id]/unlock`    | `user:update` | Mở khóa sớm tài khoản bị khóa tạm                   |
| **Hệ thống** | `GET /api/health`                   |    Public     | Kiểm tra sức khỏe hệ thống (Health check)           |

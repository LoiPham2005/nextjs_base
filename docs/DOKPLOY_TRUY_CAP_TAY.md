# Truy cập tay vào server Dokploy

> Dùng khi giao diện Dokploy không đủ để biết lỗi: SSH thẳng vào VPS để xem file, container, log.
> Phần giao diện xem [HUONG_DAN_DOKPLOY.md](HUONG_DAN_DOKPLOY.md). Viết theo Dokploy v0.30.x.

---

## 1. Vào server

```bash
ssh root@<IP-VPS>
```

Không SSH được thì vào Dokploy → Settings → **Web Server** → **Terminal**. Đó là shell trên chính
máy chủ.

**Đừng nhầm** với nút **Docker Terminal** trong trang một service. Nút đó mở shell *bên trong
container*, không chạy được lệnh `docker`. Image Alpine (node, redis…) không có `bash`, phải chọn
`/bin/sh`.

---

## 2. Bản đồ thư mục

Dokploy để hết mọi thứ ở `/etc/dokploy`:

```
/etc/dokploy/
├── compose/<appName>/
│   ├── code/            # repo đã clone + file .env Dokploy sinh ra từ tab Environment
│   └── files/           # file mount khai báo ở Advanced → Mounts (đường dẫn ../files/...)
├── applications/<appName>/
│   └── code/            # như trên, cho loại Application
├── traefik/
│   ├── traefik.yml      # cấu hình tĩnh của Traefik (entrypoint, certresolver)
│   └── dynamic/
│       ├── acme.json    # chứng chỉ Let's Encrypt đã cấp
│       ├── middlewares.yml
│       └── <appName>.yml   # route của từng Application (Compose thì nằm ở label container)
├── logs/<appName>/      # log build của từng lần deploy (*.log)
├── ssh/                 # SSH key tạo trong Settings → SSH Keys
└── monitoring/          # dữ liệu tab Monitoring
```

Mỗi bản Dokploy có thể thêm hoặc bớt vài thư mục. Chạy `ls /etc/dokploy` để xem đúng máy mình.

**`<appName>`** là tên hệ thống, không phải tên hiển thị. Nó hiện ngay dưới tên service trong
giao diện, ví dụ `nextjsbase-app-v4exof`. Muốn tra nhanh:

```bash
ls /etc/dokploy/compose /etc/dokploy/applications
```

Dữ liệu volume của Docker nằm ở `/var/lib/docker/volumes/<tên-volume>/_data`. Liệt kê bằng
`docker volume ls`.

---

## 3. Container tên gì

| Loại | Tên container / service | Xem bằng |
|---|---|---|
| Compose | `<appName>-<service>-1`, ví dụ `nextjsbase-app-v4exof-web-1` | `docker ps` |
| Application | swarm service tên `<appName>` | `docker service ls` |
| Database tạo trong Dokploy | swarm service tên `<appName>` của DB | `docker service ls` |
| Chính Dokploy | `dokploy`, `dokploy-postgres`, `dokploy-redis` | `docker service ls` |
| Traefik | container `dokploy-traefik` | `docker ps` |

Compose chỉ đặt được tên như trên khi file compose **không có `container_name`**. Có
`container_name` thì tên cố định, dễ đụng với project khác trên cùng server.

---

## 4. Lệnh hay dùng

Đặt biến trước cho gọn:

```bash
APP=nextjsbase-app-v4exof
```

**Trạng thái:**

```bash
docker ps -a --format '{{.Names}}  {{.Status}}' | grep $APP
```

`Up (healthy)` là ổn. `unhealthy` hoặc `Restarting` thì xem log ngay.

**Log app:**

```bash
docker logs $APP-web-1 --tail 100 -f     # Compose
docker service logs $APP --tail 100 -f   # Application
```

**Log build của lần deploy gần nhất:**

```bash
ls -t /etc/dokploy/logs/$APP | head -1 | xargs -I{} tail -100 /etc/dokploy/logs/$APP/{}
```

**Vào trong container:**

```bash
docker exec -it $APP-web-1 sh
```

**Xem biến môi trường container đang thực sự nhận:**

```bash
docker exec $APP-web-1 env | sort
cat /etc/dokploy/compose/$APP/code/.env
```

**Chạy lệnh compose như Dokploy:**

```bash
cd /etc/dokploy/compose/$APP/code
docker compose -p $APP -f docker-compose.dokploy.yml ps
docker compose -p $APP -f docker-compose.dokploy.yml restart web
```

**Vào psql của DB tạo trong Dokploy:**

```bash
docker ps --format '{{.Names}}' | grep <appName-của-db>
docker exec -it <tên-container-db> psql -U <user> -d <db>
```

**Khởi động lại Dokploy khi giao diện treo:**

```bash
docker service update --force dokploy
```

---

## 5. Domain không vào được: kiểm tra theo thứ tự

Triệu chứng hay gặp: trình duyệt báo `NET::ERR_CERT_AUTHORITY_INVALID`, chứng chỉ ghi
`TRAEFIK DEFAULT CERT`, còn `http://` trả 404. Nghĩa là Traefik **không thấy** container nào
khớp với domain. Kiểm tra lần lượt:

```bash
C=$APP-web-1

# 1. Container có healthy không? Traefik bỏ qua container unhealthy.
docker ps -a --format '{{.Names}}  {{.Status}}' | grep $APP

# 2. Có label traefik không? Không có là chưa Deploy lại sau khi sửa domain.
docker inspect $C --format '{{json .Config.Labels}}' | tr ',' '\n' | grep -i traefik

# 3. Có nằm trong mạng dokploy-network không?
docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# 4. App có lỗi lúc khởi động không? (thiếu hoặc sai biến env hay gặp nhất)
docker logs $C --tail 50

# 5. Let's Encrypt có cấp được chứng chỉ không?
docker logs dokploy-traefik --tail 200 2>&1 | grep -iE 'acme|<domain>'
```

| Kết quả | Cách sửa |
|---|---|
| `unhealthy` + log báo `Cấu hình môi trường không hợp lệ` | Sửa biến ở tab Environment rồi Deploy lại |
| Không có label `traefik` | Tab Domains: chọn đúng service và port, rồi **Deploy** lại |
| Thiếu `dokploy-network` | Deploy lại. Nếu vẫn thiếu, xem mục 8.3 trong [HUONG_DAN_DOKPLOY.md](HUONG_DAN_DOKPLOY.md) |
| Log Traefik báo lỗi `acme` | DNS chưa trỏ đúng IP, cổng 80 bị chặn, hoặc Cloudflare đang bật proxy |
| `port is already allocated` lúc deploy | File compose còn `ports:`. Đổi thành `expose:` |

Kiểm tra từ máy mình, không cần SSH:

```bash
dig +short <domain>
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null | openssl x509 -noout -issuer
```

---

## 6. Những việc không nên làm tay

- **Sửa code hay `.env` trong `/etc/dokploy/compose/<app>/code`.** Mỗi lần deploy, Dokploy clone
  lại repo và ghi đè `.env`. Sửa code thì push lên git, sửa biến thì dùng tab Environment.
- **Sửa `traefik/dynamic/<appName>.yml`.** Dokploy sinh lại file này khi lưu domain.
- **`docker compose down -v`** hoặc **`docker volume rm`**: xoá luôn dữ liệu, không lấy lại được.
- **`docker system prune -a --volumes`**: xoá mọi volume không có container nào đang gắn, kể
  cả DB đang tạm dừng. Muốn dọn đĩa thì chỉ chạy `docker builder prune -f` và
  `docker image prune -a -f`.
- **Xoá `acme.json`**: mọi domain phải xin lại chứng chỉ, dễ dính giới hạn của Let's Encrypt.

.PHONY: help install dev build start lint typecheck test format format-check \
        db-generate db-migrate db-studio db-seed \
        docker-build docker-up docker-down docker-logs docker-ps

# Mặc định hiển thị danh sách các lệnh
help:
	@echo "========================================================================"
	@echo "                      BẢNG HƯỚNG DẪN CÁC LỆNH MAKE                       "
	@echo "========================================================================"
	@echo "--- MÔI TRƯỜNG PHÁT TRIỂN (DEVELOPMENT) ---"
	@echo "  make install         - Cài đặt dependencies (pnpm install)"
	@echo "  make dev             - Chạy Next.js dev server với Turbopack (http://localhost:3000)"
	@echo "  make start           - Chạy máy chủ sản xuất"
	@echo ""
	@echo "--- BUILD & KIỂM TRA CHẤT LƯỢNG (BUILD & TESTING) ---"
	@echo "  make build           - Build ứng dụng Next.js sản xuất"
	@echo "  make lint            - Kiểm tra cú pháp mã nguồn (ESLint)"
	@echo "  make typecheck       - Kiểm tra kiểu dữ liệu (TypeScript)"
	@echo "  make test            - Chạy unit tests (Vitest)"
	@echo "  make format          - Định dạng mã nguồn tự động (Prettier)"
	@echo "  make format-check    - Kiểm tra chuẩn định dạng code (Prettier)"
	@echo ""
	@echo "--- QUẢN LÝ DATABASE (PRISMA) ---"
	@echo "  make db-generate     - Sinh Prisma Client"
	@echo "  make db-migrate      - Chạy Database Migration"
	@echo "  make db-studio       - Mở Prisma Studio trên giao diện web"
	@echo "  make db-seed         - Nạp dữ liệu mẫu vào Database"
	@echo ""
	@echo "--- QUẢN LÝ DOCKER ---"
	@echo "  make docker-build    - Build Docker image sản xuất"
	@echo "  make docker-up       - Khởi chạy Postgres & Web container"
	@echo "  make docker-down     - Dừng và xoá các container"
	@echo "  make docker-logs     - Xem log thời gian thực của Docker containers"
	@echo "  make docker-ps       - Xem trạng thái các container đang chạy"
	@echo "========================================================================"

# Development Commands
install:
	pnpm install

dev:
	pnpm dev

start:
	pnpm start

# Build & Quality Commands
build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

format:
	pnpm format

format-check:
	pnpm format:check

# Database Commands
db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-studio:
	pnpm db:studio

db-seed:
	pnpm db:seed

db-seed-prod:
	pnpm db:seed:prod

db-seed-dev:
	pnpm db:seed:dev

# Docker Commands
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

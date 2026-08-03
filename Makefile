.PHONY: help setup install dev build start check lint lint-fix typecheck test test-watch \
        test-coverage format format-check \
        db-generate db-migrate db-deploy db-studio db-seed db-seed-dev db-seed-prod db-reset \
        docker-build docker-up docker-down docker-logs docker-ps

help:
	@echo "========================================================================"
	@echo "                      BẢNG HƯỚNG DẪN CÁC LỆNH MAKE                      "
	@echo "========================================================================"
	@echo "--- BẮT ĐẦU ---"
	@echo "  make setup           - Cài deps + tạo .env + dựng DB + seed (chạy 1 lần)"
	@echo ""
	@echo "--- PHÁT TRIỂN ---"
	@echo "  make install         - Cài đặt dependencies"
	@echo "  make dev             - Chạy dev server (http://localhost:3000)"
	@echo "  make start           - Chạy bản build production"
	@echo "  make build           - Build production"
	@echo ""
	@echo "--- CHẤT LƯỢNG ---"
	@echo "  make check           - Chạy tất cả: typecheck + lint + format + test"
	@echo "  make typecheck       - Kiểm tra kiểu TypeScript"
	@echo "  make lint            - ESLint (make lint-fix để tự sửa)"
	@echo "  make test            - Unit test (test-watch / test-coverage)"
	@echo "  make format          - Prettier (format-check để chỉ kiểm tra)"
	@echo ""
	@echo "--- DATABASE ---"
	@echo "  make db-migrate      - Tạo migration mới (dev)"
	@echo "  make db-deploy       - Áp migration đã có (production)"
	@echo "  make db-generate     - Sinh Prisma Client"
	@echo "  make db-studio       - Mở Prisma Studio"
	@echo "  make db-seed-dev     - Nạp dữ liệu mẫu"
	@echo "  make db-seed-prod    - Chỉ tạo tài khoản admin nền"
	@echo "  make db-reset        - XOÁ SẠCH database rồi tạo lại"
	@echo ""
	@echo "--- DOCKER ---"
	@echo "  make docker-build    - Build image"
	@echo "  make docker-up       - Chạy postgres + migrate + web"
	@echo "  make docker-down     - Dừng và xoá container"
	@echo "  make docker-logs     - Xem log realtime"
	@echo "  make docker-ps       - Trạng thái container"
	@echo "========================================================================"

# Một lệnh duy nhất để có môi trường chạy được từ repo vừa clone.
setup:
	pnpm install
	@test -f .env || (cp .env.example .env && echo "→ Đã tạo .env — hãy set SESSION_SECRET: openssl rand -base64 48")
	docker compose up -d postgres
	@echo "→ Đợi Postgres sẵn sàng..."
	@until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
	pnpm db:migrate
	pnpm db:seed:dev
	@echo "→ Xong. Chạy 'make dev'."

install:
	pnpm install

dev:
	pnpm dev

start:
	pnpm start

build:
	pnpm build

check:
	pnpm check

lint:
	pnpm lint

lint-fix:
	pnpm lint:fix

typecheck:
	pnpm typecheck

test:
	pnpm test

test-watch:
	pnpm test:watch

test-coverage:
	pnpm test:coverage

format:
	pnpm format

format-check:
	pnpm format:check

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-deploy:
	pnpm db:deploy

db-studio:
	pnpm db:studio

db-seed:
	pnpm db:seed

db-seed-dev:
	pnpm db:seed:dev

db-seed-prod:
	pnpm db:seed:prod

db-reset:
	pnpm db:reset

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

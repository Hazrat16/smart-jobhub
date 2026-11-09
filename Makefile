# Local development shortcuts. Run `make help` to list targets.

API_DIR     := apps/api
WEB_DIR     := apps/web
COMPOSE     := docker compose -f $(API_DIR)/docker-compose.dev.yml
MONGO_LOCAL := mongodb://127.0.0.1:27017/job-platform

.DEFAULT_GOAL := help
.PHONY: help dev up down stop logs ps seed test clean

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-6s %s\n", $$1, $$2}'

dev: up $(WEB_DIR)/node_modules/.package-lock.json ## Start everything: api + Mongo + Redis (Docker) and web on :3000. Ctrl-C stops all.
	@echo "api → http://localhost:5000   web → http://localhost:3000   (api logs: make logs)"
	@trap 'trap - EXIT; echo; $(COMPOSE) stop' EXIT INT TERM; (cd $(WEB_DIR) && npm run dev)

up: ## Start api + Mongo + Redis in the background
	$(COMPOSE) up -d --build

stop: ## Stop the containers (keeps data)
	$(COMPOSE) stop

down: ## Remove the containers (keeps the Mongo volume)
	$(COMPOSE) down

logs: ## Follow api logs
	$(COMPOSE) logs -f job-platform-api

ps: ## Show container status
	$(COMPOSE) ps

seed: $(API_DIR)/node_modules/.package-lock.json ## Load demo data: make seed DEMO_PASSWORD=... [SEED_ADMIN_PASSWORD=...]
	@test -n "$(DEMO_PASSWORD)" || { echo "Set DEMO_PASSWORD, e.g. make seed DEMO_PASSWORD=choose-something"; exit 1; }
	cd $(API_DIR) && MONGODB_URI=$(MONGO_LOCAL) DEMO_PASSWORD='$(DEMO_PASSWORD)' \
		SEED_ADMIN_PASSWORD='$(SEED_ADMIN_PASSWORD)' SEED_DEMO_CONFIRM=yes npm run seed:demo

test: $(API_DIR)/node_modules/.package-lock.json ## Run api tests against a throwaway Mongo on :27099
	@docker rm -f jobhub-test-mongo >/dev/null 2>&1 || true
	docker run -d --name jobhub-test-mongo -p 27099:27017 mongo:7.0 >/dev/null
	@trap 'docker rm -f jobhub-test-mongo >/dev/null' EXIT; cd $(API_DIR) && npm test

clean: ## Remove containers AND the Mongo volume (deletes local data)
	$(COMPOSE) down -v

# Install deps only when the lockfile changed since the last install.
%/node_modules/.package-lock.json: %/package-lock.json
	cd $* && npm ci

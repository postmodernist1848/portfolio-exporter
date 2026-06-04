DEPLOY_HOST ?= root@portfolio.postmodernist1848.ru
DEPLOY_DIR ?= portfolio-exporter
DEPLOY_BRANCH ?= master

.PHONY: deploy deploy-logs deploy-status

deploy:
	ssh $(DEPLOY_HOST) 'set -e; cd $(DEPLOY_DIR); git fetch origin $(DEPLOY_BRANCH); git reset --hard origin/$(DEPLOY_BRANCH); docker compose up --build -d'

deploy-logs:
	ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR); docker compose logs -f app'

deploy-status:
	ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR); docker compose ps'

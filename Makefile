DEPLOY_HOST ?= root@portfolio.postmodernist1848.ru
DEPLOY_DIR ?= portfolio-exporter
DEPLOY_BRANCH ?= master
DEPLOY_IMAGE_ARCHIVE ?= /tmp/portfolio-exporter-images.tar.gz

.PHONY: deploy deploy-build-remote logs status

deploy:
	docker build -t portfolio-exporter-app:latest .
	docker build --target migrator -t portfolio-exporter-migrate:latest .
	docker save portfolio-exporter-app:latest portfolio-exporter-migrate:latest | gzip > $(DEPLOY_IMAGE_ARCHIVE)
	scp $(DEPLOY_IMAGE_ARCHIVE) $(DEPLOY_HOST):/tmp/portfolio-exporter-images.tar.gz
	scp docker-compose.yml $(DEPLOY_HOST):$(DEPLOY_DIR)/docker-compose.yml
	ssh $(DEPLOY_HOST) 'set -e; cd $(DEPLOY_DIR); docker load -i /tmp/portfolio-exporter-images.tar.gz; docker compose up --no-build -d'

deploy-build-remote:
	ssh $(DEPLOY_HOST) 'set -e; cd $(DEPLOY_DIR); git fetch origin $(DEPLOY_BRANCH); git reset --hard origin/$(DEPLOY_BRANCH); docker compose up --build -d'

logs:
	ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR); docker compose logs -f app'

status:
	ssh $(DEPLOY_HOST) 'cd $(DEPLOY_DIR); docker compose ps'

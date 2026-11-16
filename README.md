# AccessFlow: Monitoramento Inteligente de Acessibilidade

Plataforma que identifica obstáculos em passagens acessíveis de clínicas e unidades de saúde, aciona os responsáveis e verifica se o problema foi resolvido. Global Solution FIAP 2026.2, CitizenTech, 4º ano de Engenharia de Software.

## Integrantes

| Nome completo | RM |
|---|---|
| PREENCHER | PREENCHER |
| PREENCHER | PREENCHER |
| PREENCHER | PREENCHER |

> Nome completo e RM de **todos** os integrantes. O enunciado desconta nota se faltar algum.

## Ficha Técnica do MVP

| Campo | Valor |
|---|---|
| Nome do produto | AccessFlow |
| Cidadão e território | Pessoas com deficiência e com mobilidade reduzida que usam clínicas e unidades de saúde; PREENCHER cidade/bairro do percurso piloto |
| Problema, em uma frase | Obstáculos em passagens acessíveis de unidades de saúde não são detectados nem resolvidos a tempo. |
| Proposta de valor | Detectar, registrar, acionar o responsável e verificar a resolução, com evidência e histórico. |
| Arquitetura: componentes | Frontend (nginx), API, robô de inspeção (ultrassônico), visão computacional (YOLO), RPA, LLM local com RAG, pipeline Airflow/Databricks, Docker, Terraform, GitHub Actions, Azure App Service e Azure Monitor na nuvem (Prometheus e Grafana locais via docker-compose). Ver [docs/arquitetura.md](docs/arquitetura.md). |
| Fontes de dados | PREENCHER (registros do sistema e dados públicos de estabelecimentos) |
| Modelos de IA utilizados | YOLO (detecção de obstáculos), LLM local com RAG e agente. PREENCHER nomes e versões. |
| URL do MVP e repositório | Site: https://accessflow-web-rm550453-brazilsouth.azurewebsites.net. API: https://accessflow-api-rm550453-brazilsouth.azurewebsites.net (Swagger em /docs). Repositório: https://github.com/WhipDino/accessflow |
| Indicadores de impacto | PREENCHER (ex.: tempo médio de resolução de obstruções, % de trechos sem bloqueio) |
| ODS conectados | ODS 3 (Saúde e bem-estar), ODS 10 (Redução das desigualdades), ODS 11 (Cidades e comunidades sustentáveis). PREENCHER como o projeto contribui para cada meta. |

## Como o DevOps funciona (Secure DevOps Tools & Cloud Computing, "Deploy Blindado")

```
git push -> Gitleaks -> Semgrep -> build + Trivy -> push no GHCR -> deploy no App Service (OIDC) -> smoke test
```

| Critério da disciplina | Onde está |
|---|---|
| Dockerfile enxuto, não root, sem segredo | `api/Dockerfile`, `frontend/Dockerfile` |
| Stack com `docker compose` | `docker-compose.yml` |
| Nuvem por Terraform, state e `.tfvars` fora do repo, sem segredos no código | `terraform/` (HTTPS obrigatório, sem porta administrativa exposta), `.gitignore` |
| GitHub Actions com build, Gitleaks, Semgrep e Trivy, segredos no GitHub Secrets, deploy automático | `.github/workflows/ci-cd.yml` |
| Dashboard das 4 métricas de ouro e alerta | `monitoring/` (Prometheus, Grafana provisionado) |
| Diagrama, responsabilidade compartilhada, LGPD, custo | `docs/arquitetura.md` |

## Como reproduzir

### 1. Local

```bash
cp .env.example .env          # defina GRAFANA_ADMIN_PASSWORD
docker compose up -d --build
```

- App: http://localhost (a API responde em `/api/health`)
- Grafana: http://localhost:3000 (usuário `admin`, senha do `.env`), pasta **AccessFlow**
- Prometheus: http://127.0.0.1:9090

### 2. Nuvem (Azure)

Pré-requisitos: `az login`, Terraform >= 1.6, repositório público no GitHub.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # preencha (arquivo ignorado pelo git)
terraform init
terraform plan
terraform apply
```

O output `mvp_url` é a URL pública do MVP.

### 3. Deploy automático (uma vez)

```bash
./scripts/setup-oidc.sh SEU_USUARIO/accessflow
```

Cadastre os 5 valores impressos em *GitHub > Settings > Secrets and variables > Actions*. Depois do primeiro push na `main`, torne os pacotes `accessflow-api` e `accessflow-frontend` **públicos** em *GitHub > Packages > Package settings*, para a VM baixar as imagens sem credencial.

### 4. Provar a observabilidade

```bash
for i in $(seq 1 50); do curl -s -o /dev/null http://<IP>/api/erro-teste; done   # taxa de erros sobe
docker compose stop api                                                          # no compose local: alerta "API fora do ar" dispara
```

Tire o print do Grafana (dashboard e alerta em *Firing*) e suba a API de novo com `docker compose start api`.

### 5. Evidência "barrada e corrigida"

1. Abra uma branch `demo-segredo` e gere um token **falso** no formato de um token do GitHub, direto no arquivo (assim ele nunca aparece neste README nem na `main`):
   ```bash
   git checkout -b demo-segredo
   echo "github_token=ghp_$(openssl rand -hex 18)" > demo-segredo.txt
   git add demo-segredo.txt && git commit -m "demo: segredo falso para o Gitleaks" && git push -u origin demo-segredo
   ```
   O Gitleaks deve reprovar o job. Tire o print. (Evite o exemplo público da AWS, `AKIA...EXAMPLE`: a regra padrão o ignora de propósito.)
2. Remova o arquivo (`git rm demo-segredo.txt`), faça push de novo: o pipeline passa. Tire o print. **Não faça merge da branch demo**, para o segredo falso não ficar no histórico da `main`.

## Aviso sobre este repositório base

`api/main.py` e `frontend/index.html` são **placeholders** só para provar o pipeline. O time substitui pelos componentes reais mantendo: `GET /health`, `GET /metrics` (Prometheus), e o `Dockerfile` não root de cada serviço.

# Arquitetura (DevOps e Cloud)

```mermaid
flowchart LR
  dev[Desenvolvedor] -->|git push| gh[GitHub]
  gh --> gl
  subgraph CI[GitHub Actions]
    gl[Gitleaks] --> sg[Semgrep] --> bt[Build + Trivy] --> pub[Push GHCR]
  end
  pub --> ghcr[(GHCR)]
  pub -->|OIDC + az vm run-command| nsg
  subgraph AZ[Azure - rg-accessflow]
    nsg{{NSG}} --> VM
    subgraph VM[VM Ubuntu + Docker]
      fe[frontend nginx :80] --> api[API :8000]
      prom[Prometheus] -->|/metrics| api
      graf[Grafana :3000] --> prom
    end
  end
  cidadao[Cidadao / avaliador] -->|80, 443| nsg
  admin[Admin - IP fixo] -->|22, 3000| nsg
  ghcr -->|docker pull| VM
  tf[Terraform] -.cria.-> AZ
```

## Responsabilidade compartilhada

| Camada | Quem cuida |
|---|---|
| Hardware, datacenter, hypervisor, rede fisica | Microsoft (Azure) |
| Sistema operacional da VM (patches, SSH, firewall/NSG) | Equipe |
| Docker, imagens, dependencias (Trivy) | Equipe |
| Codigo da aplicacao (Semgrep) e segredos (Gitleaks, GitHub Secrets) | Equipe |
| Dados pessoais e consentimento (LGPD) | Equipe, como controladora |

## Onde ficam os dados pessoais (LGPD)

Preencher com o que o produto realmente guarda. Pontos a declarar:

- Quais dados pessoais existem (ex.: contato do responsavel pelo estabelecimento) e a finalidade de cada um.
- Onde ficam: banco do produto na VM (regiao `brazilsouth`, dados no Brasil).
- Imagens do robo e da visao: nao devem capturar rostos. Se capturarem, anonimizar antes de armazenar.
- Minimizacao: a pagina publica do cidadao mostra apenas o status do acesso, sem dados pessoais.
- Segredos fora do codigo: GitHub Secrets (CI) e `.env` com permissao 600 na VM.

## Estimativa de custo (preencher com o print da Azure Pricing Calculator)

| Recurso | Dimensao | Custo mensal |
|---|---|---|
| VM `Standard_B2s` Linux | 730 h | ver calculadora |
| Disco `StandardSSD_LRS` 30 GB | 1 disco | ver calculadora |
| IP publico Standard estatico | 1 IP | ver calculadora |
| GHCR, GitHub Actions (repo publico) | | gratis |
| **Total** | | **preencher** |

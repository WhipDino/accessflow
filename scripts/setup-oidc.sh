#!/usr/bin/env bash
# Cria o app do Azure AD + credencial federada para o GitHub Actions fazer deploy SEM senha.
# Rode UMA vez, depois do `terraform apply`, logado com `az login`.
# Uso: ./scripts/setup-oidc.sh SEU_USUARIO/accessflow
set -euo pipefail

REPO="${1:?uso: $0 DONO/REPO}"
RG="rg-accessflow"
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)

APP_ID=$(az ad app create --display-name "accessflow-github-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID" >/dev/null

# menor privilegio: so pode operar VMs dentro do resource group do projeto
az role assignment create --assignee "$APP_ID" --role "Virtual Machine Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG" >/dev/null

az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${REPO}:ref:refs/heads/main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}" >/dev/null

echo "Cadastre estes 5 valores em GitHub > Settings > Secrets and variables > Actions:"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT"
echo "AZURE_SUBSCRIPTION_ID=$SUB"
echo "AZURE_RESOURCE_GROUP=$RG"
echo "AZURE_VM_NAME=vm-accessflow"

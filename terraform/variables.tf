variable "subscription_id" {
  description = "ID da assinatura Azure (az account show --query id -o tsv)"
  type        = string
}

variable "location" {
  description = "Regiao Azure"
  type        = string
  default     = "brazilsouth"
}

variable "prefix" {
  description = "Prefixo dos recursos"
  type        = string
  default     = "accessflow"
}

variable "vm_size" {
  description = "Tamanho da VM. Se a regiao nao tiver B2s/B1s disponivel, rode: az vm list-skus -l <regiao> -o table"
  type        = string
  default     = "Standard_B2s"
}

variable "admin_cidr" {
  description = "IP/CIDR do admin (ex.: 200.10.20.30/32). Libera SSH e Grafana SOMENTE para ele. Nunca 0.0.0.0/0."
  type        = string

  validation {
    condition     = !contains(["0.0.0.0/0", "*", "Internet", "Any"], var.admin_cidr) && can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr precisa ser um CIDR valido e nao pode abrir a porta administrativa para o mundo (0.0.0.0/0)."
  }
}

variable "ssh_public_key" {
  description = "Chave publica SSH (conteudo de ~/.ssh/id_ed25519.pub)"
  type        = string
}

variable "repo_url" {
  description = "URL HTTPS do repositorio publico (clonado na VM para obter compose e configs)"
  type        = string
}

variable "grafana_admin_password" {
  description = "Senha do admin do Grafana"
  type        = string
  sensitive   = true
}

variable "api_image" {
  description = "Imagem da API no GHCR"
  type        = string
  default     = "ghcr.io/SEU_USUARIO/accessflow-api:latest"
}

variable "frontend_image" {
  description = "Imagem do frontend no GHCR"
  type        = string
  default     = "ghcr.io/SEU_USUARIO/accessflow-frontend:latest"
}

variable "location" {
  description = "Regiao Azure"
  type        = string
  default     = "brazilsouth"
}

variable "subscription_id" {
  description = "ID da assinatura Azure (az account show --query id -o tsv)"
  type        = string
}

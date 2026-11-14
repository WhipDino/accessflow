terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # State LOCAL (terraform.tfstate esta no .gitignore e nunca vai ao repositorio).
  # Para time maior, troque por backend "azurerm" (Storage Account).
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

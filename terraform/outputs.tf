output "api_url" { value = "https://${azurerm_linux_web_app.api.default_hostname}" }
output "api_nome" { value = azurerm_linux_web_app.api.name }
output "resource_group" { value = azurerm_resource_group.rg.name }

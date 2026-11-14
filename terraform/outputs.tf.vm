output "public_ip" {
  value = azurerm_public_ip.pip.ip_address
}

output "mvp_url" {
  value = "http://${azurerm_public_ip.pip.ip_address}"
}

output "grafana_url" {
  description = "Acessivel somente a partir do admin_cidr"
  value       = "http://${azurerm_public_ip.pip.ip_address}:3000"
}

output "resource_group" {
  value = azurerm_resource_group.rg.name
}

output "vm_name" {
  value = azurerm_linux_virtual_machine.vm.name
}

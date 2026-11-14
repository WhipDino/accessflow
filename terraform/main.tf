# Compute em Azure App Service (containers do GHCR). A versao com VM esta em main.tf.vm
resource "azurerm_resource_group" "rg" {
  name     = "rg-accessflow-${var.location}"
  location = var.location
  tags     = { projeto = "accessflow", disciplina = "devops" }
}

resource "azurerm_service_plan" "plan" {
  name                = "plan-accessflow"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-accessflow"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_linux_web_app" "api" {
  name                = "accessflow-api-rm550453-${var.location}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  service_plan_id     = azurerm_service_plan.plan.id
  https_only          = true

  site_config {
    always_on         = true
    health_check_path = "/health"
    health_check_eviction_time_in_min = 5
    application_stack {
      docker_image_name   = "whipdino/accessflow-api:latest"
      docker_registry_url = "https://ghcr.io"
    }
  }

  app_settings = {
    WEBSITES_PORT = "8000"
  }
}

resource "azurerm_monitor_diagnostic_setting" "api" {
  name                       = "diag-api"
  target_resource_id         = azurerm_linux_web_app.api.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  enabled_log { category = "AppServiceHTTPLogs" }
  enabled_log { category = "AppServiceConsoleLogs" }
  metric { category = "AllMetrics" }
}

resource "azurerm_monitor_action_group" "ag" {
  name                = "ag-accessflow"
  resource_group_name = azurerm_resource_group.rg.name
  short_name          = "accessflow"
}

resource "azurerm_monitor_metric_alert" "erros5xx" {
  name                = "alerta-erros-5xx"
  resource_group_name = azurerm_resource_group.rg.name
  scopes              = [azurerm_linux_web_app.api.id]
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"
  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }
  action { action_group_id = azurerm_monitor_action_group.ag.id }
}

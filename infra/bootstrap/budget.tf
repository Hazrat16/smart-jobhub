# Account-wide cost budget. Emails at 80% and 100% of actual spend, and when
# the month's forecast crosses 100%, which is usually the earliest warning.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = {
      actual-80      = { type = "ACTUAL", threshold = 80 }
      actual-100     = { type = "ACTUAL", threshold = 100 }
      forecasted-100 = { type = "FORECASTED", threshold = 100 }
    }

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.budget_alert_emails
    }
  }
}

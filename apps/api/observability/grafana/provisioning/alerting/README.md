Grafana-managed alert rules would be provisioned from YAML files here. The alert
rules for this stack live in Prometheus instead (../../../prometheus/alerts.yml);
Grafana lists them under Alerting > Alert rules. This folder exists so Grafana
doesn't log an error at startup for a missing provisioning directory.

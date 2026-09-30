alert_emails = ["hazrat17016@gmail.com"]

# No domain yet: the site is served on https://<id>.cloudfront.net.
# With a domain in Route 53, uncomment both lines:
# zone_name   = "example.com"
# domain_name = "staging.example.com"

# Raise to 1 once the secret has values and a version is deployed (setup.md step 19).
api_desired_count = 1
web_desired_count = 1

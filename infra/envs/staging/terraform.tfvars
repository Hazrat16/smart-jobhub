# Fill in before the first plan.
zone_name   = "example.com"
domain_name = "staging.example.com"

# Raise to 1 once the secret has values (rollout step 5) and CD has pushed an image (step 6).
api_desired_count = 0
web_desired_count = 0

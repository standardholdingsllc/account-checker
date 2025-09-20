# Environment Variables Setup

Create a `.env.local` file in the root directory with the following variables:

## Required Environment Variables

### Unit.co API Configuration
```bash
# Get your API token from Unit Dashboard > Developer > API Tokens
UNIT_API_TOKEN=your_unit_api_token_here

# Unit.co API Environment URLs:
# Sandbox (for testing) - use this for initial development
UNIT_API_BASE_URL=https://api.s.unit.sh

# Production (live data) - switch to this when ready for live monitoring  
# UNIT_API_BASE_URL=https://api.unit.co

# Note: You'll need separate API tokens for sandbox vs production environments
```

### Slack Integration
```bash
# Create a Slack App and get the webhook URL
# Go to https://api.slack.com/apps > Create New App > Incoming Webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### Optional Configuration
```bash
# Optional: Protect the cron endpoint with a secret
CRON_SECRET=your_secret_key_for_cron_protection

# Optional: Set your app URL for Slack links (auto-detected on Vercel)
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

## Complete .env.local Example
```bash
UNIT_API_TOKEN=v2.public.eyJyb2xlIjoib3JnIiwidX...
UNIT_API_BASE_URL=https://api.s.unit.sh
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T1234567890/B1234567890/XXXXXXXXXXXXXXXXXXXXXXXX
CRON_SECRET=my-secure-random-string-123
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

## Setup Instructions

1. **Unit.co API Token**:
   - Log into your Unit Dashboard
   - Go to Developer > API Tokens
   - Create a new **Org API Token** with the following scopes:
     - `accounts:read` (required - to fetch account data)
     - `customers:read` (optional - for customer names, may not be available)
     - `accounts:transactions:read` (optional - for transaction history, may not be available)
   
   **Note**: Based on Unit.co documentation, some scopes may require bank partner approval.
   The system works with just `accounts:read` scope using simplified dormancy detection.

2. **Slack Webhook**:
   - Go to https://api.slack.com/apps
   - Create a new app for your workspace
   - Enable Incoming Webhooks
   - Add a webhook to the desired channel
   - Copy the webhook URL

3. **Environment File**:
   - Create `.env.local` in your project root
   - Add all the variables above
   - Never commit this file to version control

## Vercel Deployment

When deploying to Vercel, add these environment variables in your project settings:
- Go to your Vercel project dashboard
- Settings > Environment Variables
- Add each variable with the same names and your production values

## Testing

You can test the setup by running:
```bash
curl https://your-app.vercel.app/api/check-dormant
```

Or for the summary endpoint:
```bash
curl https://your-app.vercel.app/api/summary
```

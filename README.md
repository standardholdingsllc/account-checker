# Account Checker

An automated monitoring system that integrates with Unit.co's API and sends alerts to your team's Slack channel.

## Features

- **Automated Monitoring**: Continuous account analysis and monitoring
- **Smart Alerts**: Intelligent notification system
- **Weekday-Only Operation**: Respects your team's work schedule
- **Slack Integration**: Rich notifications with account details and balances
- **Vercel Deployment**: Easy serverless deployment with cron scheduling
- **Unit.co Best Practices**: Follows official Unit.co API guidelines for optimal performance

## Quick Start

### 1. Clone and Install
```bash
git clone <your-repo>
cd account-checker
npm install
```

### 2. Environment Setup
Follow the detailed instructions in `ENVIRONMENT_SETUP.md` to configure:
- Unit.co API token
- Slack webhook URL
- Optional security settings

### 3. Local Testing
```bash
npm run dev
```

Test the endpoints:
- `http://localhost:3000/api/check-dormant` - Run dormancy check
- `http://localhost:3000/api/summary` - Get account summary

### 4. Deploy to Vercel
```bash
npx vercel --prod
```

Add your environment variables in Vercel's dashboard under Project Settings > Environment Variables.

## Scheduled Execution

The system automatically runs Monday-Friday at 10:00 AM EST via Vercel Cron Jobs. The schedule is defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/check-dormant",
      "schedule": "0 15 * * 1-5"
    }
  ]
}
```

You can modify the schedule using standard cron syntax:
- `0 15 * * 1-5` = 10:00 AM EST, Monday-Friday  
- `0 19 * * 1-5` = 2:00 PM EST, Monday-Friday
- `30 14 * * 1-5` = 9:30 AM EST, Monday-Friday

## API Endpoints

### GET `/api/check-dormant`
Runs the full monitoring check and sends alerts to Slack.

**Response:**
```json
{
  "success": true,
  "message": "Check completed successfully...",
  "data": {
    "communicationNeeded": 2,
    "closureNeeded": 1,
    "timestamp": "2024-01-15T10:00:00.000Z"
  }
}
```

### GET `/api/summary`
Returns a summary of all accounts and upcoming alerts.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAccounts": 150,
    "accountsByStatus": {
      "Open": 145,
      "Frozen": 5
    },
    "upcomingAlerts": {
      "communicationSoon": [...],
      "closureSoon": [...]
    }
  }
}
```

## Security

### Optional Endpoint Protection
Set the `CRON_SECRET` environment variable to protect your endpoints:

```bash
curl -H "Authorization: Bearer your-secret-key" https://your-app.vercel.app/api/check-dormant
```

### Environment Variables
- Never commit `.env.local` to version control
- Use Vercel's environment variable settings for production
- Rotate API tokens regularly per Unit.co security recommendations

## Slack Notifications

The system sends rich Slack messages with:

### Account Alerts
- Detailed account information
- Customer names and contact information
- Account balances and activity dates
- Clear action items for the team

### Error Alerts
- Error notifications with technical details when issues occur

## Technical Details

### Architecture
- **Next.js 14** with App Router for modern React patterns
- **TypeScript** for type safety and better development experience
- **Unit.co API Integration** following official [Unit.co API documentation](https://unit.co/docs/api/) best practices
- **Axios** for HTTP requests with proper error handling and retries
- **date-fns** for reliable date calculations

### Unit.co API Best Practices
- **🔐 OAuth 2.0 Authentication**: Secure Bearer token authentication
- **📄 Proper Pagination**: Uses `page[limit]` and `page[offset]` parameters
- **⏱️ Rate Limiting**: Implements 25ms delays and handles 429 responses
- **🛡️ Error Handling**: Comprehensive handling for 401, 403, 429, and 5xx responses
- **📝 JSON:API Format**: Correct `Content-Type: application/vnd.api+json` headers
- **⏰ Timeouts**: 30-second timeouts as recommended by Unit.co
- **🏷️ Scope Management**: Clear documentation of required token scopes

**Required API Scopes:**
- `accounts:read` (required) - To fetch account data
- `customers:read` (optional) - For customer names (may require bank approval)
- `accounts:transactions:read` (optional) - For transaction history (may require bank approval)

### Rate Limiting
- Built-in delays between API calls to respect Unit.co rate limits
- Exponential backoff for failed requests
- Timeout handling for long-running operations

### Error Handling
- Comprehensive error logging
- Automatic Slack error notifications
- Graceful degradation for partial failures

## Development

### Adding New Alert Types
1. Update the `DormancyAlert` type in `src/types/unit.ts`
2. Add new logic in `DormancyService.checkDormantAccounts()`
3. Create new Slack message formatting in `SlackService`

### Modifying Dormancy Rules
Edit the logic in `src/lib/dormancyService.ts`:
- `getDormantAccounts()` for threshold changes
- `checkDormantAccounts()` for business rule modifications

### Testing
```bash
# Run type checking
npx tsc --noEmit

# Run linting
npm run lint

# Test specific endpoints locally
curl http://localhost:3000/api/check-dormant
curl http://localhost:3000/api/summary
```

## Monitoring

### Slack Channels
Ensure your Slack webhook points to a channel that:
- Your operations team actively monitors
- Has appropriate notification settings
- Includes relevant stakeholders for account closure decisions

### Vercel Functions
Monitor your function executions in Vercel's dashboard:
- Functions tab shows execution logs
- Analytics for performance metrics
- Error tracking and alerting

## Support

For issues related to:
- **Unit.co API**: Check their documentation at https://docs.unit.co
- **Vercel Deployment**: Vercel's documentation and support
- **This Application**: Check logs in Vercel dashboard or Slack error alerts

## License

This project is proprietary to your neobank operations.

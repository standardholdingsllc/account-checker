import { NextRequest, NextResponse } from 'next/server';
import { UnitApiClient } from '@/lib/unitClient';
import { SlackService } from '@/lib/slackService';
import { DormancyService } from '@/lib/dormancyService';

// Prevent static generation during build - this route makes external API calls
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Optional: Check for authorization header to secure the endpoint
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate required environment variables
    const unitToken = process.env.UNIT_API_TOKEN;
    const unitBaseUrl = process.env.UNIT_API_BASE_URL;
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!unitToken || !unitBaseUrl || !slackWebhookUrl) {
      throw new Error('Missing required environment variables');
    }

    // Initialize services
    const unitClient = new UnitApiClient({
      baseUrl: unitBaseUrl,
      token: unitToken,
    });

    const slackService = new SlackService(slackWebhookUrl);
    const dormancyService = new DormancyService(unitClient, slackService);

    // Get account summary
    const summary = await dormancyService.getAccountSummary();

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Summary API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

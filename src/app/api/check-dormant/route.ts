import { NextRequest, NextResponse } from 'next/server';
import { UnitApiClient } from '@/lib/unitClient';
import { SlackService } from '@/lib/slackService';
import { DormancyService } from '@/lib/dormancyService';

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

    if (!unitToken) {
      throw new Error('UNIT_API_TOKEN environment variable is required');
    }

    if (!unitBaseUrl) {
      throw new Error('UNIT_API_BASE_URL environment variable is required');
    }

    if (!slackWebhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL environment variable is required');
    }

    // Test the API token first
    console.log('Testing Unit API authentication...');
    console.log('Base URL:', unitBaseUrl);
    console.log('Token length:', unitToken.length);
    console.log('Token prefix:', unitToken.substring(0, 20) + '...');

    // Test API call manually first
    try {
      const testResponse = await fetch(`${unitBaseUrl}/identity`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${unitToken}`,
          'Content-Type': 'application/vnd.api+json',
        },
      });

      console.log('Identity API response status:', testResponse.status);
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('Identity API error:', errorText);
        throw new Error(`Unit API authentication failed: ${testResponse.status} - ${errorText}`);
      }

      const identityData = await testResponse.json();
      console.log('Authentication successful:', identityData);
    } catch (authError) {
      console.error('Authentication test failed:', authError);
      throw new Error(`Authentication failed: ${authError instanceof Error ? authError.message : String(authError)}`);
    }

    // Initialize services
    const unitClient = new UnitApiClient({
      baseUrl: unitBaseUrl,
      token: unitToken,
    });

    const slackService = new SlackService(slackWebhookUrl);
    const dormancyService = new DormancyService(unitClient, slackService);

    // Check if this is a manual trigger (has manual=true query parameter)
    const isManual = request.nextUrl.searchParams.get('manual') === 'true';
    
    // Run the dormancy check
    const result = await dormancyService.checkDormantAccounts(isManual);

    // Return the result
    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: {
        communicationNeeded: result.communicationNeeded,
        closureNeeded: result.closureNeeded,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('API route error:', error);
    
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

export async function POST(request: NextRequest) {
  // Support both GET and POST for flexibility with different cron services
  return GET(request);
}

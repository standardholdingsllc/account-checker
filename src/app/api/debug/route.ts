import { NextRequest, NextResponse } from 'next/server';
import { UnitApiClient } from '@/lib/unitClient';

export async function GET(request: NextRequest) {
  try {
    // Validate required environment variables
    const unitToken = process.env.UNIT_API_TOKEN;
    const unitBaseUrl = process.env.UNIT_API_BASE_URL;

    if (!unitToken || !unitBaseUrl) {
      throw new Error('Missing required environment variables');
    }

    // Initialize Unit client
    const unitClient = new UnitApiClient({
      baseUrl: unitBaseUrl,
      token: unitToken,
    });

    console.log('Starting debug account fetch...');
    
    // Get detailed account info for debugging
    const allAccounts = await unitClient.getAllAccountsWithActivity();
    
    console.log(`Debug: processed ${allAccounts.length} accounts`);
    
    // Separate accounts by activity and age
    const debugInfo = {
      totalAccounts: allAccounts.length,
      rawAccountCount: allAccounts.length,
      accountsByStatus: allAccounts.reduce((acc, account) => {
        acc[account.status] = (acc[account.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      accounts: allAccounts.map(account => ({
        accountId: account.accountId,
        customerName: account.customerName,
        status: account.status,
        hasActivity: account.hasActivity,
        daysSinceCreation: account.daysSinceCreation,
        daysSinceLastActivity: account.daysSinceLastActivity,
        balance: account.balance / 100, // Convert from cents to dollars
        accountCreated: account.accountCreated.toISOString(),
        lastActivity: account.lastActivity?.toISOString() || null,
      })),
      dormancyAnalysis: {
        accountsWithNoActivity: allAccounts.filter(acc => !acc.hasActivity),
        accountsOlderThan120Days: allAccounts.filter(acc => !acc.hasActivity && acc.daysSinceCreation >= 120),
        accountsOlderThan9Months: allAccounts.filter(acc => acc.hasActivity && acc.daysSinceLastActivity >= 270),
        accountsOlderThan12Months: allAccounts.filter(acc => acc.hasActivity && acc.daysSinceLastActivity >= 365),
      },
      filters: {
        closedAccountsSkipped: 'No - all accounts fetched, closed filtered in dormancy analysis only',
        transactionLookup: 'Gets most recent transaction per account, handles 404s gracefully',
        dateCalculation: 'Uses date-fns differenceInDays from account creation to now',
        paginationUsed: 'Yes - fetches all pages with 100 account batches',
        errorHandling: 'Continues processing even if individual accounts fail',
      },
      apiDetails: {
        endpoint: '/accounts?page[limit]=100&page[offset]={offset}&sort=createdAt',
        rateLimitDelay: '50ms between API calls',
        transactionEndpoint: '/accounts/{id}/transactions?page[limit]=1&sort=-createdAt',
      }
    };

    // Add summary counts
    debugInfo.dormancyAnalysis = {
      ...debugInfo.dormancyAnalysis,
      summary: {
        noActivityCount: debugInfo.dormancyAnalysis.accountsWithNoActivity.length,
        olderThan120DaysCount: debugInfo.dormancyAnalysis.accountsOlderThan120Days.length,
        needs9MonthCommunication: debugInfo.dormancyAnalysis.accountsOlderThan9Months.length,
        needs12MonthClosure: debugInfo.dormancyAnalysis.accountsOlderThan12Months.length,
      }
    };

    return NextResponse.json({
      success: true,
      debug: debugInfo,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Debug API error:', error);
    
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

import { NextRequest, NextResponse } from 'next/server';
import { UnitApiClient } from '@/lib/unitClient';

export async function GET(request: NextRequest) {
  try {
    // Validate required environment variables
    const unitToken = process.env.UNIT_API_TOKEN;
    const unitBaseUrl = process.env.UNIT_API_BASE_URL;

    if (!unitToken) {
      throw new Error('UNIT_API_TOKEN environment variable is required');
    }

    if (!unitBaseUrl) {
      throw new Error('UNIT_API_BASE_URL environment variable is required');
    }

    console.log('Fetching detailed dormant accounts list...');
    console.log(`Environment: ${unitBaseUrl.includes('s.unit.sh') ? 'Sandbox' : 'Production'}`);

    // Initialize Unit API client
    const unitClient = new UnitApiClient({
      baseUrl: unitBaseUrl,
      token: unitToken,
    });

    // Get dormant accounts
    const { communicationNeeded, closureNeeded } = await unitClient.getDormantAccounts();
    
    const allDormantAccounts = [...communicationNeeded, ...closureNeeded];
    
    // Calculate totals
    const totalBalance = allDormantAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const avgAge = allDormantAccounts.length > 0 ? 
      allDormantAccounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / allDormantAccounts.length : 0;

    // Sort by balance (highest first) for prioritization
    const sortedAccounts = allDormantAccounts.sort((a, b) => b.balance - a.balance);

    // Format for download/view
    const accountList = sortedAccounts.map((account, index) => ({
      priority: index + 1,
      accountId: account.accountId,
      customerId: account.customerId,
      customerName: account.customerName,
      balance: account.balance,
      balanceFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(account.balance / 100),
      daysSinceCreation: account.daysSinceCreation,
      accountCreated: account.accountCreated.toISOString().split('T')[0], // YYYY-MM-DD format
      status: account.status,
      closureReason: account.daysSinceCreation >= 120 ? 
        'No activity for 120+ days' : 
        'Meets closure criteria'
    }));

    // Check if CSV export is requested
    const format = request.nextUrl.searchParams.get('format');
    
    if (format === 'csv') {
      // Generate CSV content
      const csvHeaders = [
        'Priority',
        'Account ID',
        'Customer ID', 
        'Customer Name',
        'Balance (USD)',
        'Days Since Creation',
        'Created Date',
        'Status',
        'Closure Reason'
      ].join(',');

      const csvRows = accountList.map(account => [
        account.priority,
        account.accountId,
        account.customerId,
        `"${account.customerName}"`, // Quote customer names in case of commas
        account.balanceFormatted.replace('$', '').replace(',', ''), // Remove formatting for CSV
        account.daysSinceCreation,
        account.accountCreated,
        account.status,
        `"${account.closureReason}"`
      ].join(','));

      const csvContent = [csvHeaders, ...csvRows].join('\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="dormant-accounts-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Return JSON response with summary and account list
    return NextResponse.json({
      success: true,
      summary: {
        totalDormantAccounts: allDormantAccounts.length,
        communicationNeeded: communicationNeeded.length,
        closureNeeded: closureNeeded.length,
        totalBalance: totalBalance,
        totalBalanceFormatted: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(totalBalance / 100),
        averageAge: Math.round(avgAge),
        oldestAccount: allDormantAccounts.length > 0 ? 
          Math.max(...allDormantAccounts.map(acc => acc.daysSinceCreation)) : 0,
        timestamp: new Date().toISOString()
      },
      accounts: accountList,
      downloadUrls: {
        csv: `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv`,
        json: `${request.nextUrl.origin}${request.nextUrl.pathname}`
      }
    });

  } catch (error) {
    console.error('Dormant accounts export error:', error);
    
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

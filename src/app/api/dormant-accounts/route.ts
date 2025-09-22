import { NextRequest, NextResponse } from 'next/server';
import { UnitApiClient } from '@/lib/unitClient';

// Prevent static generation during build - this route makes external API calls
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    
    // Check if specific type is requested
    const requestedType = request.nextUrl.searchParams.get('type');
    let selectedAccounts: any[];
    let filename: string;
    
    if (requestedType === 'communication') {
      selectedAccounts = communicationNeeded;
      filename = 'warning-list';
    } else if (requestedType === 'closure') {
      selectedAccounts = closureNeeded;
      filename = 'closure-list';
    } else if (requestedType === 'historical') {
      // Historical accounts: had activity, now 12+ months dormant
      selectedAccounts = closureNeeded.filter(acc => acc.hasActivity);
      filename = 'historical-accounts';
    } else if (requestedType === 'inactive') {
      // Never-active accounts: no activity, 120+ days old
      selectedAccounts = closureNeeded.filter(acc => !acc.hasActivity);
      filename = 'never-active-accounts';
    } else {
      // Default: return all dormant accounts
      selectedAccounts = [...communicationNeeded, ...closureNeeded];
      filename = 'dormant-accounts';
    }
    
    const allDormantAccounts = selectedAccounts;
    
    // Calculate totals
    const totalBalance = allDormantAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const avgAge = allDormantAccounts.length > 0 ? 
      allDormantAccounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / allDormantAccounts.length : 0;

    // Calculate employer analytics
    const employerStats = allDormantAccounts.reduce((stats, account) => {
      const company = account.companyName || 'Unknown';
      if (!stats[company]) {
        stats[company] = {
          companyName: company,
          accountCount: 0,
          totalBalance: 0,
          accounts: []
        };
      }
      stats[company].accountCount++;
      stats[company].totalBalance += account.balance;
      stats[company].accounts.push({
        accountId: account.accountId,
        customerName: account.customerName,
        balance: account.balance
      });
      return stats;
    }, {} as Record<string, {
      companyName: string;
      accountCount: number;
      totalBalance: number;
      accounts: Array<{accountId: string; customerName: string; balance: number}>;
    }>);

    // Sort employers by account count (most dormant accounts first)
    const employersByCount = Object.values(employerStats)
      .sort((a, b) => b.accountCount - a.accountCount)
      .slice(0, 10); // Top 10

    // Sort employers by total balance (highest balance first)
    const employersByBalance = Object.values(employerStats)
      .sort((a, b) => b.totalBalance - a.totalBalance)
      .slice(0, 10); // Top 10

    // Sort by balance (highest first) for prioritization
    const sortedAccounts = allDormantAccounts.sort((a, b) => b.balance - a.balance);

    // Format for download/view
    const accountList = sortedAccounts.map((account, index) => ({
      priority: index + 1,
      accountId: account.accountId,
      customerId: account.customerId,
      customerName: account.customerName,
      customerEmail: account.customerEmail || '',
      customerAddress: account.customerAddress || '',
      companyName: account.companyName || 'Unknown',
      balance: account.balance,
      balanceFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(account.balance / 100),
      hasActivity: account.hasActivity,
      daysSinceCreation: account.daysSinceCreation,
      accountCreated: account.accountCreated.toISOString().split('T')[0], // YYYY-MM-DD format
      lastActivity: account.lastActivity ? account.lastActivity.toISOString().split('T')[0] : 'Never',
      daysSinceLastActivity: account.daysSinceLastActivity,
      status: account.status,
      closureReason: account.hasActivity ? 
        `Historical account - No activity for ${account.daysSinceLastActivity} days (12+ months dormant)` : 
        `Never-active account - No transactions for ${account.daysSinceCreation} days (120+ days old)`
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
        'Customer Email',
        'Customer Address',
        'Company Name',
        'Balance (USD)',
        'Has Activity',
        'Days Since Creation',
        'Created Date',
        'Last Activity Date',
        'Days Since Last Activity',
        'Status',
        'Closure Reason'
      ].join(',');

      const csvRows = accountList.map(account => [
        account.priority,
        account.accountId,
        account.customerId,
        `"${account.customerName}"`, // Quote customer names in case of commas
        `"${account.customerEmail}"`,
        `"${account.customerAddress}"`,
        `"${account.companyName}"`,
        account.balanceFormatted.replace('$', '').replace(',', ''), // Remove formatting for CSV
        account.hasActivity ? 'Yes' : 'No',
        account.daysSinceCreation,
        account.accountCreated,
        account.lastActivity,
        account.daysSinceLastActivity,
        account.status,
        `"${account.closureReason}"`
      ].join(','));

      const csvContent = [csvHeaders, ...csvRows].join('\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Return JSON response with summary and account list
    return NextResponse.json({
      success: true,
      requestedType: requestedType || 'all',
      summary: {
        totalDormantAccounts: allDormantAccounts.length,
        communicationNeeded: communicationNeeded.length,
        closureNeeded: closureNeeded.length,
        historicalAccounts: closureNeeded.filter(acc => acc.hasActivity).length,
        inactiveAccounts: closureNeeded.filter(acc => !acc.hasActivity).length,
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
      employerAnalytics: {
        totalCompanies: Object.keys(employerStats).length,
        topEmployersByCount: employersByCount.map(emp => ({
          companyName: emp.companyName,
          dormantAccountCount: emp.accountCount,
          totalBalanceFormatted: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
          }).format(emp.totalBalance / 100),
          sampleAccounts: emp.accounts.slice(0, 3) // First 3 accounts as samples
        })),
        topEmployersByBalance: employersByBalance.map(emp => ({
          companyName: emp.companyName,
          dormantAccountCount: emp.accountCount,
          totalBalance: emp.totalBalance,
          totalBalanceFormatted: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
          }).format(emp.totalBalance / 100)
        }))
      },
      accounts: accountList,
      downloadUrls: {
        warningListCsv: communicationNeeded.length > 0 ? 
          `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv&type=communication` : null,
        closureListCsv: closureNeeded.length > 0 ? 
          `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv&type=closure` : null,
        historicalAccountsCsv: closureNeeded.filter(acc => acc.hasActivity).length > 0 ? 
          `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv&type=historical` : null,
        inactiveAccountsCsv: closureNeeded.filter(acc => !acc.hasActivity).length > 0 ? 
          `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv&type=inactive` : null,
        allAccountsCsv: `${request.nextUrl.origin}${request.nextUrl.pathname}?format=csv`
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

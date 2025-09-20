import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  UnitApiConfig,
  UnitAccount,
  UnitTransaction,
  UnitApiListResponse,
  UnitApiResponse,
  AccountActivity,
} from '@/types/unit';
import { differenceInDays, parseISO } from 'date-fns';

export class UnitApiClient {
  private client: AxiosInstance;

  constructor(config: UnitApiConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/vnd.api+json',
      },
      timeout: 30000, // 30 seconds timeout as per Unit docs
    });

    // Add request interceptor for logging (reduced verbosity)
    this.client.interceptors.request.use(
      (config) => {
        // Only log non-routine requests to reduce spam
        if (config.url?.includes('/identity') || config.url?.includes('/accounts?') || !config.url?.includes('transactions')) {
          console.log(`Making request to: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error('Authentication failed - check your Unit API token');
        } else if (error.response?.status === 429) {
          console.error('Rate limit exceeded - backing off');
        }
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async getAccounts(limit = 100, offset = 0): Promise<UnitAccount[]> {
    try {
      const allAccounts: UnitAccount[] = [];
      let currentOffset = offset;
      let hasMoreData = true;

      while (hasMoreData) {
        // Remove any status filters - get ALL accounts including closed ones
        const response: AxiosResponse<UnitApiListResponse<UnitAccount>> = await this.client.get(
          `/accounts?page[limit]=${limit}&page[offset]=${currentOffset}&sort=createdAt`
        );
        
        const accounts = response.data.data;
        allAccounts.push(...accounts);
        
        // Log progress every 10 batches to reduce spam
        if (currentOffset % 1000 === 0 || accounts.length < limit) {
          console.log(`Fetched ${accounts.length} accounts at offset ${currentOffset} (total: ${allAccounts.length})`);
        }

        // Check if we got fewer results than requested, indicating we've reached the end
        if (accounts.length < limit) {
          hasMoreData = false;
        } else {
          currentOffset += limit;
        }

        // Safety check to prevent infinite loops
        if (allAccounts.length > 50000) {
          console.warn('Reached maximum account limit (50,000) - stopping pagination');
          hasMoreData = false;
        }

        // Add small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      console.log(`Total accounts fetched: ${allAccounts.length}`);
      
      // Log account types and statuses for debugging
      const accountsByType = allAccounts.reduce((acc, account) => {
        acc[account.type] = (acc[account.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const accountsByStatus = allAccounts.reduce((acc, account) => {
        acc[account.attributes.status] = (acc[account.attributes.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('Accounts by type:', accountsByType);
      console.log('Accounts by status:', accountsByStatus);
      
      return allAccounts;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  // Customer API disabled due to permission issues in production
  // async getCustomer(customerId: string): Promise<UnitCustomer> { ... }

  async getAccountTransactions(accountId: string, limit = 1, offset = 0): Promise<UnitTransaction[]> {
    try {
      const response: AxiosResponse<UnitApiListResponse<UnitTransaction>> = await this.client.get(
        `/accounts/${accountId}/transactions?page[limit]=${limit}&page[offset]=${offset}&sort=-createdAt`
      );
      return response.data.data;
    } catch (error) {
      // Don't throw error if account has no transactions - this is expected for dormant accounts
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          // 404 is expected for accounts with no transactions, don't log as it's normal
          return [];
        }
      }
      // Only log non-404 errors
      console.error(`Error fetching transactions for account ${accountId}:`, error);
      return [];
    }
  }

  async getAllAccountsWithActivity(): Promise<AccountActivity[]> {
    const accounts = await this.getAccounts();
    const accountActivities: AccountActivity[] = [];

    console.log(`Processing ${accounts.length} accounts...`);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      try {
        // Log progress every 100 accounts to reduce log spam
        if (i % 100 === 0 || i < 20) {
          console.log(`Processing account ${i + 1}/${accounts.length}: ${account.id} (${account.attributes.status})`);
        }
        
        // Skip customer lookup for now due to permission issues
        // Use account-based identifiers instead
        let customerName = `Account ${account.id}`;
        let customerEmail: string | undefined = undefined;
        let customerId = account.relationships.customer.data.id;
        
        // Log customer permission issue only once every 100 accounts
        if (i % 100 === 0 && i < 500) {
          console.warn(`Customer API returning 404s - likely permission issue. Using account IDs instead.`);
        }
        
        // Get account transactions - this should not throw errors now
        const transactions = await this.getAccountTransactions(account.id, 1);
        
        const accountCreated = parseISO(account.attributes.createdAt);
        const hasActivity = transactions.length > 0;
        let lastActivity: Date | undefined;
        let daysSinceLastActivity = 0;

        if (hasActivity) {
          lastActivity = parseISO(transactions[0].attributes.createdAt);
          daysSinceLastActivity = differenceInDays(new Date(), lastActivity);
        }

        const daysSinceCreation = differenceInDays(new Date(), accountCreated);

        const activity: AccountActivity = {
          accountId: account.id,
          customerId: customerId,
          customerName,
          customerEmail,
          accountCreated,
          lastActivity,
          hasActivity,
          daysSinceLastActivity,
          daysSinceCreation,
          balance: account.attributes.balance,
          status: account.attributes.status,
        };

        accountActivities.push(activity);

        // Add a small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 25));
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        console.error('Account data:', JSON.stringify(account, null, 2));
        // Continue with other accounts even if one fails
        continue;
      }
    }

    console.log(`Successfully processed ${accountActivities.length} accounts`);
    return accountActivities;
  }

  async getDormantAccounts(): Promise<{
    communicationNeeded: AccountActivity[];
    closureNeeded: AccountActivity[];
  }> {
    const allAccounts = await this.getAllAccountsWithActivity();

    const communicationNeeded: AccountActivity[] = [];
    const closureNeeded: AccountActivity[] = [];

    console.log(`Analyzing ${allAccounts.length} accounts for dormancy...`);

    for (const account of allAccounts) {
      // Skip closed accounts for dormancy analysis
      if (account.status === 'Closed') {
        continue;
      }

      // Only log accounts that are flagged or close to being flagged
      const willBeFlagged = (!account.hasActivity && account.daysSinceCreation >= 120) || 
                           (account.hasActivity && account.daysSinceLastActivity >= 270);
      
      if (willBeFlagged || account.daysSinceCreation >= 100 || account.daysSinceLastActivity >= 250) {
        console.log(`Account ${account.accountId}: ${account.hasActivity ? 'has activity' : 'no activity'}, ${account.daysSinceCreation} days old, ${account.daysSinceLastActivity} days since last activity`);
      }

      if (account.hasActivity) {
        // Accounts with activity: 9 months = communication, 12 months = closure
        if (account.daysSinceLastActivity >= 365) { // 12 months (365 days)
          console.log(`Account ${account.accountId} flagged for closure (${account.daysSinceLastActivity} days since activity)`);
          closureNeeded.push(account);
        } else if (account.daysSinceLastActivity >= 270) { // 9 months (270 days)
          console.log(`Account ${account.accountId} flagged for communication (${account.daysSinceLastActivity} days since activity)`);
          communicationNeeded.push(account);
        }
      } else {
        // Accounts with no activity: 120 days = closure
        if (account.daysSinceCreation >= 120) {
          console.log(`Account ${account.accountId} flagged for closure (${account.daysSinceCreation} days old, no activity)`);
          closureNeeded.push(account);
        } else {
          console.log(`Account ${account.accountId} is ${account.daysSinceCreation} days old with no activity (under 120 day threshold)`);
        }
      }
    }

    console.log(`Dormancy analysis complete: ${communicationNeeded.length} need communication, ${closureNeeded.length} need closure`);
    return { communicationNeeded, closureNeeded };
  }
}

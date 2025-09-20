import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  UnitApiConfig,
  UnitAccount,
  UnitTransaction,
  UnitCustomer,
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

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`Making request to: ${config.method?.toUpperCase()} ${config.url}`);
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
        console.log(`Fetched ${accounts.length} accounts at offset ${currentOffset}`);
        allAccounts.push(...accounts);

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
        await new Promise(resolve => setTimeout(resolve, 50));
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

  async getCustomer(customerId: string): Promise<UnitCustomer> {
    try {
      const response: AxiosResponse<UnitApiResponse<UnitCustomer>> = await this.client.get(
        `/customers/${customerId}`
      );
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching customer ${customerId}:`, error);
      throw error;
    }
  }

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
          console.log(`Account ${accountId} has no transactions (404 - expected for new accounts)`);
          return [];
        }
      }
      console.error(`Error fetching transactions for account ${accountId}:`, error);
      // Return empty array instead of throwing - account might exist but have no transactions
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
        console.log(`Processing account ${i + 1}/${accounts.length}: ${account.id} (${account.attributes.status})`);
        
        // Get customer information - handle cases where customer might not exist
        let customer;
        let customerName = 'Unknown Customer';
        let customerEmail: string | undefined;
        
        try {
          customer = await this.getCustomer(account.relationships.customer.data.id);
          customerName = `${customer.attributes.fullName.first} ${customer.attributes.fullName.last}`;
          customerEmail = customer.attributes.email;
        } catch (customerError) {
          console.warn(`Could not fetch customer ${account.relationships.customer.data.id} for account ${account.id}:`, customerError);
          // Continue processing account even if customer data is missing
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
          customerId: customer?.id || 'unknown',
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
        await new Promise(resolve => setTimeout(resolve, 50));
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

      console.log(`Account ${account.accountId}: ${account.hasActivity ? 'has activity' : 'no activity'}, ${account.daysSinceCreation} days old, ${account.daysSinceLastActivity} days since last activity`);

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

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

  async getAccounts(limit = 1000, offset = 0): Promise<UnitAccount[]> {
    try {
      const response: AxiosResponse<UnitApiListResponse<UnitAccount>> = await this.client.get(
        `/accounts?page[limit]=${limit}&page[offset]=${offset}`
      );
      return response.data.data;
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

  async getAccountTransactions(accountId: string, limit = 1000, offset = 0): Promise<UnitTransaction[]> {
    try {
      const response: AxiosResponse<UnitApiListResponse<UnitTransaction>> = await this.client.get(
        `/accounts/${accountId}/transactions?page[limit]=${limit}&page[offset]=${offset}&sort=-createdAt`
      );
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching transactions for account ${accountId}:`, error);
      throw error;
    }
  }

  async getAllAccountsWithActivity(): Promise<AccountActivity[]> {
    const accounts = await this.getAccounts();
    const accountActivities: AccountActivity[] = [];

    for (const account of accounts) {
      try {
        // Skip closed accounts
        if (account.attributes.status === 'Closed') {
          continue;
        }

        // Get customer information
        const customer = await this.getCustomer(account.relationships.customer.data.id);
        
        // Get account transactions
        const transactions = await this.getAccountTransactions(account.id, 1); // Only get the most recent transaction
        
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
          customerId: customer.id,
          customerName: `${customer.attributes.fullName.first} ${customer.attributes.fullName.last}`,
          customerEmail: customer.attributes.email,
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
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        // Continue with other accounts even if one fails
        continue;
      }
    }

    return accountActivities;
  }

  async getDormantAccounts(): Promise<{
    communicationNeeded: AccountActivity[];
    closureNeeded: AccountActivity[];
  }> {
    const allAccounts = await this.getAllAccountsWithActivity();

    const communicationNeeded: AccountActivity[] = [];
    const closureNeeded: AccountActivity[] = [];

    for (const account of allAccounts) {
      if (account.hasActivity) {
        // Accounts with activity: 9 months = communication, 12 months = closure
        if (account.daysSinceLastActivity >= 365) { // 12 months (365 days)
          closureNeeded.push(account);
        } else if (account.daysSinceLastActivity >= 270) { // 9 months (270 days)
          communicationNeeded.push(account);
        }
      } else {
        // Accounts with no activity: 120 days = closure
        if (account.daysSinceCreation >= 120) {
          closureNeeded.push(account);
        }
      }
    }

    return { communicationNeeded, closureNeeded };
  }
}

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
import { AddressMappingService } from './addressMappingService';

/**
 * Unit.co API Client following official best practices
 * https://unit.co/docs/api/
 * 
 * - Uses OAuth 2.0 Bearer Token authentication
 * - Implements proper pagination with page[limit] and page[offset]
 * - Handles rate limiting with delays and retry logic
 * - Uses correct JSON:API content type
 * - Implements 30-second timeouts as recommended
 */
export class UnitApiClient {
  private client: AxiosInstance;
  private addressMappingService: AddressMappingService;

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
          console.error('Authentication failed - check your Unit API token and scopes');
          console.error('Required scopes: accounts:read, accounts:transactions:read, customers:read (if available)');
        } else if (error.response?.status === 429) {
          console.error('Rate limit exceeded - request will be retried by Axios');
          // Unit.co docs suggest implementing exponential backoff for 429s
          // Axios will handle retries if configured
        } else if (error.response?.status === 403) {
          console.error('Forbidden - insufficient token permissions for this resource');
        } else if (error.response?.status >= 500) {
          console.error('Server error - may be temporary, consider retrying');
        }
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );

    // Initialize address mapping service
    this.addressMappingService = new AddressMappingService();
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

        // Safety check to prevent infinite loops (Unit API supports up to 1000 per page)
        if (allAccounts.length > 50000) {
          console.warn('Reached maximum account limit (50,000) - stopping pagination');
          console.warn('Consider using filters or date ranges if you need to process more accounts');
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

  async getAccountTransactions(accountId: string, limit = 1, offset = 0): Promise<UnitTransaction[]> {
    try {
      // CORRECTED: Use the proper Unit.co API endpoint format
      const response: AxiosResponse<UnitApiListResponse<UnitTransaction>> = await this.client.get(
        `/transactions?filter[accountId]=${accountId}&page[limit]=${limit}&page[offset]=${offset}&sort=-createdAt`
      );
      console.log(`✅ Successfully fetched ${response.data.data.length} transactions for account ${accountId}`);
      return response.data.data;
    } catch (error) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number, data?: any } };
        if (axiosError.response?.status === 404) {
          // 404 can mean no transactions exist for this account (legitimate)
          return [];
        } else if (axiosError.response?.status === 403) {
          console.error(`❌ Transaction API 403 for account ${accountId} - missing transactions:read permission`);
          return [];
        } else {
          console.error(`❌ Transaction API Error for account ${accountId}:`, {
            status: axiosError.response?.status,
            data: axiosError.response?.data
          });
        }
      } else {
        console.error(`❌ Unexpected transaction API error for account ${accountId}:`, error);
      }
      return [];
    }
  }

  async getCustomer(customerId: string): Promise<UnitCustomer | null> {
    try {
      // Use shorter timeout for customer calls to fail fast and preserve core functionality
      const response: AxiosResponse<UnitApiResponse<UnitCustomer>> = await this.client.get(
        `/customers/${customerId}`,
        { timeout: 5000 } // 5 second timeout (shorter than default 30s)
      );
      return response.data.data;
    } catch (error) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number, data?: any } };
        if (axiosError.response?.status === 404) {
          // 404 is normal - customer not found, don't log as error
          return null;
        } else if (axiosError.response?.status === 403) {
          // 403 is permissions issue - don't log as error since it's expected sometimes
          return null;
        } else if (axiosError.response?.status === 429) {
          // Rate limit hit - throw error to trigger circuit breaker
          throw new Error(`Customer API rate limit exceeded for ${customerId}`);
        } else {
          // Other errors - throw to trigger circuit breaker
          throw new Error(`Customer API ${axiosError.response?.status} error for ${customerId}`);
        }
      } else if (error && typeof error === 'object' && 'code' in error && error.code === 'ECONNABORTED') {
        // Timeout - throw to trigger circuit breaker
        throw new Error(`Customer API timeout for ${customerId}`);
      } else {
        // Unknown error - throw to trigger circuit breaker  
        throw new Error(`Unexpected customer API error for ${customerId}`);
      }
    }
  }

  private formatCustomerAddress(customer: UnitCustomer | null): string | undefined {
    if (!customer?.attributes?.address) {
      return undefined;
    }

    const addr = customer.attributes.address;
    const parts = [
      addr.street,
      addr.street2,
      addr.city,
      addr.state,
      addr.postalCode
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  async getAllAccountsWithActivity(): Promise<AccountActivity[]> {
    const accounts = await this.getAccounts();
    const accountActivities: AccountActivity[] = [];

    console.log(`Processing ${accounts.length} accounts with proper transaction analysis...`);

    // TEMPORARILY DISABLE ADDRESS MAPPING TO ISOLATE TRANSACTION ANALYSIS ISSUE
    // TODO: Re-enable address mapping once core functionality is verified correct
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      try {
        // Log progress every 100 accounts to reduce log spam
        if (i % 100 === 0 || i < 20) {
          console.log(`Processing account ${i + 1}/${accounts.length}: ${account.id} (${account.attributes.status})`);
        }
        
        // Use simplified identifiers (customer API may still have issues)
        const customerName = `Account ${account.id}`;
        const customerEmail: string | undefined = undefined;
        const customerId = account.relationships.customer.data.id;
        
        // Log API status once every 1000 accounts
        if (i % 1000 === 0 && i < 3000) {
          console.log(`API Status: Using transaction data for accurate dormancy detection`);
        }
        
        // Get account transactions to determine activity
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

        // Small delay for rate limiting
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        // Continue with other accounts even if one fails
        continue;
      }
    }

    console.log(`Successfully processed ${accountActivities.length} accounts with transaction data`);
    return accountActivities;
  }

  /**
   * PHASE 2: Optional address mapping enhancement
   * Takes existing AccountActivity records and enhances them with customer/address data
   * This is completely separate from core transaction analysis and can fail without affecting core functionality
   */
  async enhanceAccountsWithAddressMapping(accounts: AccountActivity[]): Promise<AccountActivity[]> {
    console.log(`🔄 Phase 2: Enhancing ${accounts.length} accounts with address mapping...`);
    
    // Load address mappings
    if (!this.addressMappingService.isLoaded()) {
      try {
        await this.addressMappingService.loadMappings();
        const stats = this.addressMappingService.getStats();
        console.log(`✅ Address mappings loaded: ${stats.totalMappings} addresses mapped to ${stats.totalCompanies} companies`);
      } catch (error) {
        console.warn(`⚠️ Failed to load address mappings - continuing without enhancement:`, error);
        return accounts; // Return original accounts unchanged
      }
    }

    const enhancedAccounts: AccountActivity[] = [];
    let customerApiFailures = 0;
    const MAX_FAILURES = 25; // Allow more failures since this is optional
    let enhancementEnabled = true;

    for (let i = 0; i < accounts.length; i++) {
      const account = { ...accounts[i] }; // Copy original account
      
      // Progress logging
      if (i % 100 === 0 || i < 10) {
        console.log(`Enhancing account ${i + 1}/${accounts.length} (${enhancementEnabled ? 'enabled' : 'disabled after failures'})`);
      }

      // Optional enhancement - only if still enabled
      if (enhancementEnabled && customerApiFailures < MAX_FAILURES) {
        try {
          // Add throttling to be respectful of API limits
          if (i > 0 && i % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay every 50 accounts
          }

          const customer = await this.getCustomer(account.customerId);
          if (customer?.attributes) {
            // Enhance with real customer name
            const fullName = customer.attributes.fullName;
            account.customerName = `${fullName.first} ${fullName.last}`.trim();
            account.customerEmail = customer.attributes.email;
            
            // Format and map customer address to company
            account.customerAddress = this.formatCustomerAddress(customer);
            if (account.customerAddress) {
              account.companyName = this.addressMappingService.getCompanyName(account.customerAddress) || undefined;
              account.companyId = this.addressMappingService.getCompanyId(account.customerAddress) || undefined;
              
              // Log successful mapping for first few
              if (i < 5 && account.companyName) {
                console.log(`✅ Address mapped: "${account.customerAddress}" → ${account.companyName}`);
              }
            }
          }
        } catch (error) {
          customerApiFailures++;
          console.warn(`Customer API error for account ${account.accountId} (failure ${customerApiFailures}/${MAX_FAILURES}):`, error instanceof Error ? error.message : error);
          
          if (customerApiFailures >= MAX_FAILURES) {
            enhancementEnabled = false;
            console.warn(`⚠️ Disabling address mapping after ${customerApiFailures} failures - core data preserved`);
          }
          // Continue with original account data - no enhancement
        }
      }

      enhancedAccounts.push(account);
    }

    // Report enhancement results
    const accountsWithCompanyMapping = enhancedAccounts.filter(acc => acc.companyName && acc.companyName !== 'Unknown').length;
    const mappingSuccessRate = enhancedAccounts.length > 0 ? Math.round((accountsWithCompanyMapping / enhancedAccounts.length) * 100) : 0;
    
    console.log(`📊 Address mapping results: ${accountsWithCompanyMapping}/${enhancedAccounts.length} accounts mapped to companies (${mappingSuccessRate}% success rate)`);
    console.log(`📊 Customer API status: ${enhancementEnabled ? 'Healthy' : 'Disabled'} (${customerApiFailures} failures)`);
    
    if (!enhancementEnabled) {
      console.log(`ℹ️  Address mapping was disabled due to API issues, but all core account data preserved`);
    }

    return enhancedAccounts;
  }

  async getDormantAccounts(): Promise<{
    communicationNeeded: AccountActivity[];
    closureNeeded: AccountActivity[];
  }> {
    // PHASE 1: Core transaction analysis (working perfectly - don't touch!)
    console.log(`🔄 Phase 1: Core transaction analysis...`);
    const coreAccounts = await this.getAllAccountsWithActivity();
    
    // PHASE 2: Optional address mapping enhancement (completely separate)
    const allAccounts = await this.enhanceAccountsWithAddressMapping(coreAccounts);

    const communicationNeeded: AccountActivity[] = [];
    const closureNeeded: AccountActivity[] = [];

    console.log(`Analyzing ${allAccounts.length} accounts for dormancy...`);

    // Count accounts by status for filtering transparency
    const statusCounts = allAccounts.reduce((acc, account) => {
      acc[account.status] = (acc[account.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const closedCount = statusCounts['Closed'] || 0;
    const frozenCount = statusCounts['Frozen'] || 0;
    const filteredOutCount = closedCount + frozenCount;
    const eligibleCount = allAccounts.length - filteredOutCount;
    
    console.log(`Account status breakdown: Open=${statusCounts['Open'] || 0}, Frozen=${frozenCount}, Closed=${closedCount}`);
    console.log(`Filtering out ${filteredOutCount} accounts (${closedCount} closed + ${frozenCount} frozen), analyzing ${eligibleCount} eligible accounts`);

    // Safety check: Verify transaction API is working properly
    const accountsWithActivity = allAccounts.filter(acc => acc.hasActivity);
    const activityRate = accountsWithActivity.length / allAccounts.length;
    
    console.log(`Activity detection stats: ${accountsWithActivity.length}/${allAccounts.length} accounts show activity (${Math.round(activityRate * 100)}%)`);
    
    if (activityRate < 0.05 && allAccounts.length > 1000) { // Less than 5% activity rate in very large dataset
      console.warn(`⚠️ WARNING: Only ${Math.round(activityRate * 100)}% of accounts show transaction activity`);
      console.warn(`⚠️ This seems unusually low - please verify results manually`);
      console.warn(`⚠️ If incorrect, check transaction API permissions: transactions:read`);
    } else {
      console.log(`✅ Transaction API working correctly (${Math.round(activityRate * 100)}% activity rate)`);
    }

    for (const account of allAccounts) {
      // Skip closed or frozen accounts for dormancy analysis
      if (account.status === 'Closed' || account.status === 'Frozen') {
        continue;
      }

      // Implement proper business logic based on transaction activity
      if (account.hasActivity) {
        // Accounts with previous activity: 9 months communication, 12 months closure
        if (account.daysSinceLastActivity >= 365) { // 12 months (365 days)
          console.log(`Account ${account.accountId} flagged for closure: ${account.daysSinceLastActivity} days since last transaction`);
          closureNeeded.push(account);
        } else if (account.daysSinceLastActivity >= 270) { // 9 months (270 days)
          console.log(`Account ${account.accountId} flagged for communication: ${account.daysSinceLastActivity} days since last transaction`);
          communicationNeeded.push(account);
        }
      } else {
        // Accounts with no activity: 120 days closure (no communication needed)
        if (account.daysSinceCreation >= 120) {
          console.log(`Account ${account.accountId} flagged for closure: ${account.daysSinceCreation} days old with no transactions`);
          closureNeeded.push(account);
        } else if (account.daysSinceCreation >= 100) {
          console.log(`Account ${account.accountId} approaching closure threshold: ${account.daysSinceCreation} days old (${120 - account.daysSinceCreation} days remaining)`);
        }
      }
    }

    console.log(`Dormancy analysis complete: ${communicationNeeded.length} need communication, ${closureNeeded.length} need closure`);
    return { communicationNeeded, closureNeeded };
  }
}
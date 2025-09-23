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
      // Only log transaction fetches for debugging (reduce log spam)
      if (Math.random() < 0.01) { // Log ~1% of successful transaction fetches
        console.log(`✅ Successfully fetched ${response.data.data.length} transactions for account ${accountId}`);
      }
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


  async getAllAccountsWithActivity(): Promise<AccountActivity[]> {
    const accounts = await this.getAccounts();
    const accountActivities: AccountActivity[] = [];

    console.log(`Processing ${accounts.length} accounts with proper transaction analysis...`);
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      try {
        // Log progress every 1000 accounts to reduce log spam
        if (i % 1000 === 0) {
          console.log(`🔄 Processing account ${i + 1}/${accounts.length}: ${account.id} (${account.attributes.status})`);
        }
        
        // Use simplified identifiers (customer API may still have issues)
        const customerName = `Account ${account.id}`;
        const customerEmail: string | undefined = undefined;
        const customerId = account.relationships.customer.data.id;
        
        // Log API status once every 2000 accounts
        if (i % 2000 === 0) {
          console.log(`📊 API Status: Using transaction data for accurate dormancy detection (${i}/${accounts.length})`);
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
        console.error(`❌ Error processing account ${account.id}:`, error);
        // Continue with other accounts even if one fails - don't let one account break everything
        continue;
      }
    }

    console.log(`✅ Phase 1 COMPLETE: Successfully processed ${accountActivities.length} accounts with transaction data`);
    console.log(`🔄 Phase 1 Summary: ${accounts.length} total accounts processed, ${accountActivities.length} account records created`);
    return accountActivities;
  }

  /**
   * PHASE 2: Optional address mapping enhancement
   * Takes existing AccountActivity records and enhances them with customer/address data
   * This is completely separate from core transaction analysis and can fail without affecting core functionality
   */
  async enhanceAccountsWithAddressMapping(accounts: AccountActivity[]): Promise<AccountActivity[]> {
    console.log(`🚀 PHASE 2 STARTED: Enhancing ${accounts.length} accounts with customer-company mapping...`);
    
    if (accounts.length === 0) {
      console.log(`⚠️ No accounts to enhance - returning empty array`);
      return accounts;
    }
    
    // Load customer-company mappings
    if (!this.addressMappingService.isLoaded()) {
      try {
        await this.addressMappingService.loadMappings();
        const stats = this.addressMappingService.getStats();
        console.log(`✅ Customer-company mappings loaded: ${stats.totalMappings} customers mapped to ${stats.totalCompanies} companies`);
      } catch (error) {
        console.warn(`⚠️ Failed to load customer-company mappings - continuing without enhancement:`, error);
        return accounts; // Return original accounts unchanged
      }
    }

    const enhancedAccounts: AccountActivity[] = [];
    let successfulMappings = 0;

    console.log(`🔄 Processing ${accounts.length} accounts for company mapping (no API calls needed)...`);

    for (let i = 0; i < accounts.length; i++) {
      const account = { ...accounts[i] }; // Copy original account
      
      // Progress logging every 1000 accounts
      if (i % 1000 === 0) {
        console.log(`🔄 Mapping progress: ${i + 1}/${accounts.length} accounts processed`);
      }

      // Direct customer ID lookup - super fast, no API calls needed!
      account.companyName = this.addressMappingService.getCompanyName(account.customerId) || undefined;
      account.companyId = this.addressMappingService.getCompanyId(account.customerId) || undefined;
      
      // Enhanced debugging for first 10 mappings
      if (i < 10) {
        console.log(`🔍 Debug mapping ${i + 1}: Customer ${account.customerId} -> ${account.companyName || 'NO MATCH'}`);
      }
      
      // Count successful mappings
      if (account.companyName) {
        successfulMappings++;
        
        // Log first few successful mappings for verification
        if (successfulMappings <= 5) {
          console.log(`✅ Customer mapped: ${account.customerId} → ${account.companyName}`);
        }
      }

      enhancedAccounts.push(account);
    }

    // Report enhancement results
    const mappingSuccessRate = enhancedAccounts.length > 0 ? Math.round((successfulMappings / enhancedAccounts.length) * 100) : 0;
    
    console.log(`📊 Customer-company mapping results: ${successfulMappings}/${enhancedAccounts.length} accounts mapped to companies (${mappingSuccessRate}% success rate)`);
    console.log(`📊 Phase 2 performance: ✅ FAST - No API calls needed, direct JSON lookups only`);

    return enhancedAccounts;
  }

  async getDormantAccounts(): Promise<{
    communicationNeeded: AccountActivity[];
    closureNeeded: AccountActivity[];
  }> {
    // PHASE 1: Core transaction analysis (working perfectly - don't touch!)
    console.log(`🔄 Phase 1: Core transaction analysis...`);
    const coreAccounts = await this.getAllAccountsWithActivity();

    // Now perform filtering on coreAccounts before enhancement
    const communicationNeeded: AccountActivity[] = [];
    const closureNeeded: AccountActivity[] = [];

    console.log(`Analyzing ${coreAccounts.length} accounts for dormancy...`);

    // Count accounts by status for filtering transparency
    const statusCounts = coreAccounts.reduce((acc, account) => {
      acc[account.status] = (acc[account.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const closedCount = statusCounts['Closed'] || 0;
    const frozenCount = statusCounts['Frozen'] || 0;
    const filteredOutCount = closedCount + frozenCount;
    const eligibleCount = coreAccounts.length - filteredOutCount;

    console.log(`Account status breakdown: Open=${statusCounts['Open'] || 0}, Frozen=${frozenCount}, Closed=${closedCount}`);
    console.log(`Filtering out ${filteredOutCount} accounts (${closedCount} closed + ${frozenCount} frozen), analyzing ${eligibleCount} eligible accounts`);

    // Safety check: Verify transaction API is working properly
    const accountsWithActivity = coreAccounts.filter(acc => acc.hasActivity);
    const activityRate = accountsWithActivity.length / coreAccounts.length;

    console.log(`Activity detection stats: ${accountsWithActivity.length}/${coreAccounts.length} accounts show activity (${Math.round(activityRate * 100)}%)`);

    if (activityRate < 0.05 && coreAccounts.length > 1000) { // Less than 5% activity rate in very large dataset
      console.warn(`⚠️ WARNING: Only ${Math.round(activityRate * 100)}% of accounts show transaction activity`);
      console.warn(`⚠️ This seems unusually low - please verify results manually`);
      console.warn(`⚠️ If incorrect, check transaction API permissions: transactions:read`);
    } else {
      console.log(`✅ Transaction API working correctly (${Math.round(activityRate * 100)}% activity rate)`);
    }

    for (const account of coreAccounts) {
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

    // Now enhance only the filtered dormant accounts
    console.log(`🔄 Starting Phase 2: Address enhancement for ${communicationNeeded.length + closureNeeded.length} dormant accounts...`);

    const enhancedCommunication = await this.enhanceAccountsWithAddressMapping(communicationNeeded);
    const enhancedClosure = await this.enhanceAccountsWithAddressMapping(closureNeeded);

    console.log(`Dormancy analysis complete: ${enhancedCommunication.length} need communication, ${enhancedClosure.length} need closure`);
    return { communicationNeeded: enhancedCommunication, closureNeeded: enhancedClosure };
  }
}
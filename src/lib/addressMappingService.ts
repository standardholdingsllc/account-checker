import axios from 'axios';

export interface CustomerCompanyMappings {
  [customerId: string]: string; // Direct customer ID to company name mapping
}

/**
 * Service for mapping customer IDs to company/employer names
 * Uses the customer-company mapping data from GitHub repository
 */
export class AddressMappingService {
  private mappings: CustomerCompanyMappings | null = null;
  private readonly MAPPINGS_URL = 'https://raw.githubusercontent.com/standardholdingsllc/hubspot-address-mapper/refs/heads/main/web-app/data/customer_company.json';

  /**
   * Load customer-company mappings from the GitHub repository
   */
  async loadMappings(): Promise<void> {
    try {
      console.log('Loading customer-company mappings from GitHub repository...');
      const response = await axios.get(this.MAPPINGS_URL, {
        timeout: 10000, // 10 second timeout
      });
      
      this.mappings = response.data;
      if (this.mappings) {
        const mappingCount = Object.keys(this.mappings).length;
        console.log(`✅ Successfully loaded ${mappingCount} customer-company mappings`);
        
        // Show first few mappings for debugging
        const firstFewMappings = Object.entries(this.mappings).slice(0, 5);
        console.log(`🔍 Sample mappings:`, firstFewMappings.map(([customerId, companyName]) => `Customer ${customerId} -> "${companyName}"`).join(', '));
      } else {
        console.warn('⚠️ Loaded mappings but data is null');
        this.mappings = {};
      }
    } catch (error) {
      console.error('❌ Failed to load customer-company mappings:', error);
      // Initialize with empty mappings to prevent crashes
      this.mappings = {};
    }
  }

  /**
   * Find company name for a given customer ID
   * Simple direct lookup - much faster and more reliable than address mapping
   */
  getCompanyName(customerId: string): string | null {
    if (!this.mappings || !customerId) {
      console.log(`🔍 getCompanyName: mappings=${!!this.mappings}, customerId="${customerId}"`);
      return null;
    }

    // Direct lookup by customer ID
    const companyName = this.mappings[customerId];
    if (companyName) {
      console.log(`✅ CUSTOMER MATCH FOUND: Customer ${customerId} -> "${companyName}"`);
      return companyName;
    }

    console.log(`❌ NO MATCH FOUND for customer ID: "${customerId}"`);
    return null;
  }

  /**
   * Get company ID for a given customer ID
   * Since we only have company names in this mapping, return null for now
   */
  getCompanyId(customerId: string): number | string | null {
    // The new JSON only has company names, no IDs
    // We could potentially hash the company name or use the name as ID
    const companyName = this.getCompanyName(customerId);
    return companyName; // Use company name as ID for now
  }

  /**
   * Check if mappings are loaded
   */
  isLoaded(): boolean {
    return this.mappings !== null;
  }

  /**
   * Get mapping statistics
   */
  getStats(): {
    totalMappings: number;
    totalCompanies: number;
    sampleAddresses: string[]; // Keep this name for compatibility, but it's actually customer IDs
  } {
    if (!this.mappings) {
      return {
        totalMappings: 0,
        totalCompanies: 0,
        sampleAddresses: [],
      };
    }

    const customerIds = Object.keys(this.mappings);
    const companies = new Set(Object.values(this.mappings));

    return {
      totalMappings: customerIds.length,
      totalCompanies: companies.size,
      sampleAddresses: customerIds.slice(0, 5), // First 5 customer IDs as samples
    };
  }
}
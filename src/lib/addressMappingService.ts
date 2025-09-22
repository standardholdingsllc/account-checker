import axios from 'axios';

export interface AddressMapping {
  Company: number | string;
  'Company Name': string;
}

export interface AddressMappings {
  [address: string]: AddressMapping;
}

/**
 * Service for mapping customer addresses to company/employer names
 * Uses the HubSpot address mapping data from GitHub repository
 */
export class AddressMappingService {
  private mappings: AddressMappings | null = null;
  private readonly MAPPINGS_URL = 'https://raw.githubusercontent.com/standardholdingsllc/hubspot-address-mapper/main/web-app/data/address_mappings.json';

  /**
   * Load address mappings from the GitHub repository
   */
  async loadMappings(): Promise<void> {
    try {
      console.log('Loading address mappings from GitHub repository...');
      const response = await axios.get(this.MAPPINGS_URL, {
        timeout: 10000, // 10 second timeout
      });
      
      this.mappings = response.data;
      console.log(`✅ Successfully loaded ${Object.keys(this.mappings!).length} address mappings`);
    } catch (error) {
      console.error('❌ Failed to load address mappings:', error);
      // Initialize with empty mappings to prevent crashes
      this.mappings = {};
    }
  }

  /**
   * Normalize address string for matching
   * Handles common variations in address formatting
   */
  private normalizeAddress(address: string): string {
    if (!address) return '';
    
    return address
      .toLowerCase()
      .trim()
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Normalize common abbreviations
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bstreat\b/g, 'st') // Common typo
      .replace(/\bave\b/g, 'avenue')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\bhighway\b/g, 'hwy')
      .replace(/\bhwy\b/g, 'highway')
      .replace(/\bnorthwest\b/g, 'nw')
      .replace(/\bnortheast\b/g, 'ne')
      .replace(/\bsouthwest\b/g, 'sw')
      .replace(/\bsoutheast\b/g, 'se')
      .replace(/\bnorth\b/g, 'n')
      .replace(/\bsouth\b/g, 's')
      .replace(/\beast\b/g, 'e')
      .replace(/\bwest\b/g, 'w')
      // Remove common punctuation
      .replace(/[.,;]/g, '')
      // Handle PO Box variations
      .replace(/\bp\.?o\.?\s*box\b/g, 'po box')
      .replace(/\bpo\s*box\b/g, 'po box');
  }

  /**
   * Find company name for a given address
   * Uses fuzzy matching to handle address variations
   */
  getCompanyName(customerAddress: string): string | null {
    if (!this.mappings || !customerAddress) {
      return null;
    }

    const normalizedInput = this.normalizeAddress(customerAddress);
    
    // First try exact match (case-insensitive)
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      if (this.normalizeAddress(mappedAddress) === normalizedInput) {
        return mapping['Company Name'];
      }
    }

    // Try partial matches - check if customer address contains any mapped address
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      const normalizedMapped = this.normalizeAddress(mappedAddress);
      if (normalizedInput.includes(normalizedMapped) || normalizedMapped.includes(normalizedInput)) {
        return mapping['Company Name'];
      }
    }

    // Try address component matching (street number + street name)
    const addressParts = normalizedInput.split(' ');
    if (addressParts.length >= 2) {
      const streetInfo = addressParts.slice(0, 3).join(' '); // First 3 parts usually contain street info
      
      for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
        const normalizedMapped = this.normalizeAddress(mappedAddress);
        if (normalizedMapped.includes(streetInfo) || streetInfo.includes(normalizedMapped.split(' ').slice(0, 3).join(' '))) {
          return mapping['Company Name'];
        }
      }
    }

    return null; // No match found
  }

  /**
   * Get company ID for a given address
   */
  getCompanyId(customerAddress: string): number | string | null {
    if (!this.mappings || !customerAddress) {
      return null;
    }

    const normalizedInput = this.normalizeAddress(customerAddress);
    
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      if (this.normalizeAddress(mappedAddress) === normalizedInput) {
        return mapping.Company;
      }
    }

    return null;
  }

  /**
   * Get all available company names (for analytics)
   */
  getAllCompanyNames(): string[] {
    if (!this.mappings) {
      return [];
    }

    const companies = new Set<string>();
    Object.values(this.mappings).forEach(mapping => {
      companies.add(mapping['Company Name']);
    });

    return Array.from(companies).sort();
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
    sampleAddresses: string[];
  } {
    if (!this.mappings) {
      return {
        totalMappings: 0,
        totalCompanies: 0,
        sampleAddresses: [],
      };
    }

    const addresses = Object.keys(this.mappings);
    const companies = new Set(Object.values(this.mappings).map(m => m['Company Name']));

    return {
      totalMappings: addresses.length,
      totalCompanies: companies.size,
      sampleAddresses: addresses.slice(0, 5), // First 5 addresses as samples
    };
  }
}

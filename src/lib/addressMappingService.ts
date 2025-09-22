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
      if (this.mappings) {
        const mappingCount = Object.keys(this.mappings).length;
        console.log(`✅ Successfully loaded ${mappingCount} address mappings`);
        
        // Show first few mappings for debugging
        const firstFewMappings = Object.entries(this.mappings).slice(0, 5);
        console.log(`🔍 Sample mappings:`, firstFewMappings.map(([addr, mapping]) => `"${addr}" -> "${mapping['Company Name']}"`).join(', '));
      } else {
        console.warn('⚠️ Loaded mappings but data is null');
        this.mappings = {};
      }
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
   * Direct exact string matching - no normalization since JSON is structured exactly as needed
   */
  getCompanyName(customerAddress: string): string | null {
    if (!this.mappings || !customerAddress) {
      console.log(`🔍 getCompanyName: mappings=${!!this.mappings}, customerAddress="${customerAddress}"`);
      return null;
    }

    console.log(`🔍 Attempting to map address (NO normalization): "${customerAddress}"`);
    
    // Strategy 1: Try exact match (case-sensitive)
    if (this.mappings[customerAddress]) {
      const companyName = this.mappings[customerAddress]['Company Name'];
      console.log(`✅ EXACT MATCH FOUND: "${customerAddress}" -> "${companyName}"`);
      return companyName;
    }

    // Strategy 2: Try case-insensitive exact match
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      if (mappedAddress.toLowerCase() === customerAddress.toLowerCase()) {
        console.log(`✅ CASE-INSENSITIVE MATCH FOUND: "${customerAddress}" -> "${mappedAddress}" -> "${mapping['Company Name']}"`);
        return mapping['Company Name'];
      }
      // Show first few comparisons for debugging
      if (Object.keys(this.mappings).indexOf(mappedAddress) < 5) {
        console.log(`🔍 Comparing: "${customerAddress}" vs "${mappedAddress}"`);
      }
    }

    // Strategy 3: Extract street address from full address and try exact match
    const streetOnlyAddress = this.extractStreetAddress(customerAddress);
    console.log(`🔍 Street extraction: "${customerAddress}" -> "${streetOnlyAddress}"`);
    if (streetOnlyAddress && streetOnlyAddress !== customerAddress) {
      // Try exact match with extracted street address
      if (this.mappings[streetOnlyAddress]) {
        const companyName = this.mappings[streetOnlyAddress]['Company Name'];
        console.log(`✅ STREET EXACT MATCH FOUND: "${streetOnlyAddress}" -> "${companyName}"`);
        return companyName;
      }
      
      // Try case-insensitive match with extracted street address
      for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
        if (mappedAddress.toLowerCase() === streetOnlyAddress.toLowerCase()) {
          console.log(`✅ STREET CASE-INSENSITIVE MATCH: "${streetOnlyAddress}" -> "${mappedAddress}" -> "${mapping['Company Name']}"`);
          return mapping['Company Name'];
        }
      }
    }

    console.log(`❌ NO MATCH FOUND for address: "${customerAddress}"`);
    console.log(`🔍 Total mappings searched: ${Object.keys(this.mappings).length}`);
    return null; // No match found
  }

  /**
   * Extract street address from full address
   * "548 Pleasant Mill Rd Charlotte NC 28203" -> "548 Pleasant Mill Rd"
   */
  private extractStreetAddress(fullAddress: string): string | null {
    if (!fullAddress) return null;
    
    const parts = fullAddress.trim().split(/\s+/);
    if (parts.length < 2) return null;
    
    // Common patterns to detect where street address ends
    // Look for state abbreviations, zip codes, or common city indicators
    const statePattern = /^[A-Z]{2}$/; // Two letter state codes
    const zipPattern = /^\d{5}(-\d{4})?$/; // ZIP codes
    
    let streetEndIndex = parts.length;
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      // If we find a state abbreviation or ZIP code, street address ends before it
      if (statePattern.test(part) || zipPattern.test(part)) {
        streetEndIndex = i;
        break;
      }
      
      // If we find a part that looks like a city (starts with capital, not a street suffix)
      // and is followed by a state/zip, assume street address ends before it
      if (i < parts.length - 2 && 
          part[0] === part[0].toUpperCase() && 
          !this.isStreetSuffix(part) &&
          (statePattern.test(parts[i + 1]) || zipPattern.test(parts[i + 2]))) {
        streetEndIndex = i;
        break;
      }
    }
    
    // Take first part up to where we think the street ends
    const streetParts = parts.slice(0, streetEndIndex);
    return streetParts.length > 0 ? streetParts.join(' ') : null;
  }

  /**
   * Check if a word is a common street suffix
   */
  private isStreetSuffix(word: string): boolean {
    const suffixes = ['st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive', 
                     'ln', 'lane', 'ct', 'court', 'pl', 'place', 'way', 'blvd', 
                     'boulevard', 'hwy', 'highway', 'pkwy', 'parkway', 'nw', 'ne', 'sw', 'se'];
    return suffixes.includes(word.toLowerCase());
  }

  /**
   * Get company ID for a given address - no normalization, exact matching
   */
  getCompanyId(customerAddress: string): number | string | null {
    if (!this.mappings || !customerAddress) {
      return null;
    }

    // Try exact match
    if (this.mappings[customerAddress]) {
      return this.mappings[customerAddress].Company;
    }

    // Try case-insensitive match
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      if (mappedAddress.toLowerCase() === customerAddress.toLowerCase()) {
        return mapping.Company;
      }
    }

    // Try with extracted street address
    const streetOnlyAddress = this.extractStreetAddress(customerAddress);
    if (streetOnlyAddress && streetOnlyAddress !== customerAddress) {
      if (this.mappings[streetOnlyAddress]) {
        return this.mappings[streetOnlyAddress].Company;
      }
      
      for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
        if (mappedAddress.toLowerCase() === streetOnlyAddress.toLowerCase()) {
          return mapping.Company;
        }
      }
    }

    return null;
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
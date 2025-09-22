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
    
    // Strategy 1: Try exact match (case-insensitive)
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      if (this.normalizeAddress(mappedAddress) === normalizedInput) {
        return mapping['Company Name'];
      }
    }

    // Strategy 2: Extract street address from full address and try exact match
    // Customer might have "548 Pleasant Mill Rd Charlotte NC 28203" but mapping has "548 Pleasant Mill Rd"
    const streetOnlyAddress = this.extractStreetAddress(customerAddress);
    if (streetOnlyAddress && streetOnlyAddress !== customerAddress) {
      const normalizedStreetOnly = this.normalizeAddress(streetOnlyAddress);
      for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
        if (this.normalizeAddress(mappedAddress) === normalizedStreetOnly) {
          return mapping['Company Name'];
        }
      }
    }

    // Strategy 3: Try partial matches - check if customer address starts with mapped address
    for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
      const normalizedMapped = this.normalizeAddress(mappedAddress);
      if (normalizedInput.startsWith(normalizedMapped) || normalizedMapped.startsWith(normalizedInput)) {
        return mapping['Company Name'];
      }
    }

    // Strategy 4: Try address component matching (street number + street name)
    const addressParts = normalizedInput.split(' ');
    if (addressParts.length >= 2) {
      const streetInfo = addressParts.slice(0, 3).join(' '); // First 3 parts usually contain street info
      
      for (const [mappedAddress, mapping] of Object.entries(this.mappings)) {
        const normalizedMapped = this.normalizeAddress(mappedAddress);
        const mappedParts = normalizedMapped.split(' ');
        const mappedStreetInfo = mappedParts.slice(0, 3).join(' ');
        
        if (streetInfo === mappedStreetInfo) {
          return mapping['Company Name'];
        }
      }
    }

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
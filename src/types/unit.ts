export interface UnitApiConfig {
  baseUrl: string;
  token: string;
}

export interface UnitAccount {
  type: string;
  id: string;
  attributes: {
    createdAt: string;
    name: string;
    currency: string;
    balance: number;
    hold: number;
    available: number;
    tags?: Record<string, string>;
    status: 'Open' | 'Frozen' | 'Closed';
  };
  relationships: {
    customer: {
      data: {
        type: string;
        id: string;
      };
    };
  };
}

export interface UnitTransaction {
  type: string;
  id: string;
  attributes: {
    createdAt: string;
    direction: 'Credit' | 'Debit';
    amount: number;
    balance: number;
    summary: string;
    description: string;
    tags?: Record<string, string>;
  };
  relationships: {
    account: {
      data: {
        type: string;
        id: string;
      };
    };
  };
}

export interface UnitCustomer {
  type: string;
  id: string;
  attributes: {
    createdAt: string;
    fullName: {
      first: string;
      last: string;
    };
    email?: string;
    phone?: {
      countryCode: string;
      number: string;
    };
    address?: {
      street: string;
      street2?: string;
      city: string;
      state: string;
      postalCode: string;
      country?: string;
    };
    status: string;
    tags?: Record<string, string>;
  };
}

export interface UnitApiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      total: number;
      limit: number;
      offset: number;
    };
  };
}

export interface UnitApiListResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total: number;
      limit: number;
      offset: number;
    };
  };
}

export interface AccountActivity {
  accountId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerAddress?: string;
  companyName?: string;
  companyId?: number | string;
  accountCreated: Date;
  lastActivity?: Date;
  hasActivity: boolean;
  daysSinceLastActivity: number;
  daysSinceCreation: number;
  balance: number;
  status: 'Open' | 'Frozen' | 'Closed';
}

export interface DormancyAlert {
  type: 'communication_needed' | 'closure_needed';
  accounts: AccountActivity[];
  alertReason: string;
}

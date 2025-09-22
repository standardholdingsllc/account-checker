import { UnitApiClient } from './unitClient';
import { SlackService } from './slackService';
import { AccountActivity, DormancyAlert } from '@/types/unit';
import { format, getDay } from 'date-fns';

export class DormancyService {
  private unitClient: UnitApiClient;
  private slackService: SlackService;

  constructor(unitClient: UnitApiClient, slackService: SlackService) {
    this.unitClient = unitClient;
    this.slackService = slackService;
  }

  private isWeekday(): boolean {
    const today = new Date();
    const dayOfWeek = getDay(today); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday through Friday
  }

  private async logAndNotifyError(error: string, details?: any): Promise<void> {
    console.error(error, details);
    try {
      await this.slackService.sendErrorAlert(error, details ? JSON.stringify(details, null, 2) : undefined);
    } catch (slackError) {
      console.error('Failed to send error alert to Slack:', slackError);
    }
  }

  async checkDormantAccounts(isManual: boolean = false): Promise<{
    success: boolean;
    message: string;
    communicationNeeded: number;
    closureNeeded: number;
  }> {
    const startTime = new Date();
    
    try {
      // Only check weekdays for automated runs, allow manual runs any time
      if (!isManual && !this.isWeekday()) {
        const message = `Skipping automated dormancy check - today is ${format(startTime, 'EEEE')} (weekend)`;
        console.log(message);
        return {
          success: true,
          message,
          communicationNeeded: 0,
          closureNeeded: 0,
        };
      }

      console.log(`Starting dormancy check at ${format(startTime, 'PPpp')}`);

      // Get dormant accounts from Unit API
      const { communicationNeeded, closureNeeded } = await this.unitClient.getDormantAccounts();

      console.log(`Found ${communicationNeeded.length} accounts needing communication, ${closureNeeded.length} accounts needing closure`);

      // Send alerts if there are dormant accounts
      if (communicationNeeded.length > 0) {
        const alert: DormancyAlert = {
          type: 'communication_needed',
          accounts: communicationNeeded,
          alertReason: '9 months of inactivity - communication attempt required',
        };
        await this.slackService.sendDormancyAlert(alert);
      }

      if (closureNeeded.length > 0) {
        const alert: DormancyAlert = {
          type: 'closure_needed',
          accounts: closureNeeded,
          alertReason: closureNeeded.some(acc => acc.hasActivity) 
            ? '12 months of inactivity or 120 days with no activity - closure required'
            : '120 days with no activity - closure required',
        };
        await this.slackService.sendDormancyAlert(alert);
      }

      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      
      console.log(`Check completed at ${format(endTime, 'PPp')} in ${duration}s`);

      return {
        success: true,
        message: `Check completed successfully. Found ${communicationNeeded.length} accounts needing communication, ${closureNeeded.length} needing closure.`,
        communicationNeeded: communicationNeeded.length,
        closureNeeded: closureNeeded.length,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? error.stack : String(error);
      
      await this.logAndNotifyError(
        'Dormancy check failed',
        { message: errorMessage, stack: errorDetails }
      );

      return {
        success: false,
        message: `Check failed: ${errorMessage}`,
        communicationNeeded: 0,
        closureNeeded: 0,
      };
    }
  }

  async getAccountSummary(): Promise<{
    totalAccounts: number;
    accountsByStatus: Record<string, number>;
    upcomingAlerts: {
      communicationSoon: AccountActivity[]; // 8 months
      closureSoon: AccountActivity[]; // 11 months for active, 100 days for inactive
    };
  }> {
    try {
      const allAccounts = await this.unitClient.getAllAccountsWithActivity();
      
      const accountsByStatus = allAccounts.reduce((acc, account) => {
        acc[account.status] = (acc[account.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const communicationSoon = allAccounts.filter(account => {
        // Skip closed or frozen accounts from upcoming alerts
        if (account.status === 'Closed' || account.status === 'Frozen') {
          return false;
        }
        return account.hasActivity && 
               account.daysSinceLastActivity >= 240 && // 8 months
               account.daysSinceLastActivity < 270;    // but less than 9 months
      });

      const closureSoon = allAccounts.filter(account => {
        // Skip closed or frozen accounts from upcoming alerts
        if (account.status === 'Closed' || account.status === 'Frozen') {
          return false;
        }
        if (account.hasActivity) {
          return account.daysSinceLastActivity >= 330 && // 11 months
                 account.daysSinceLastActivity < 365;    // but less than 12 months
        } else {
          return account.daysSinceCreation >= 100 &&     // 100 days
                 account.daysSinceCreation < 120;        // but less than 120 days
        }
      });

      return {
        totalAccounts: allAccounts.length,
        accountsByStatus,
        upcomingAlerts: {
          communicationSoon,
          closureSoon,
        },
      };
    } catch (error) {
      console.error('Error getting account summary:', error);
      throw error;
    }
  }
}

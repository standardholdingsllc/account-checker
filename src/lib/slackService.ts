import axios from 'axios';
import { AccountActivity, DormancyAlert } from '@/types/unit';
import { format } from 'date-fns';

export class SlackService {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100); // Unit API returns amounts in cents
  }


  private createCommunicationAlert(accounts: AccountActivity[]) {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const avgAge = accounts.reduce((sum, acc) => sum + acc.daysSinceLastActivity, 0) / accounts.length;
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_BASE_URL 
      ? process.env.NEXT_PUBLIC_BASE_URL
      : 'https://your-app.vercel.app';
    
    return {
      text: "🔔 Account Communication Alert - 9 Month Dormancy",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔔 Communication Required - 9 Month Dormant Accounts"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${accounts.length}* accounts have been dormant for 9+ months and need communication attempts.\n\n*Summary:*\n• Account Count: *${accounts.length}*\n• Total Balance: *${this.formatCurrency(totalBalance)}*\n• Average Dormancy: *${Math.round(avgAge)} days*`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Action Required:* Send good faith communication attempts via:\n• Email\n• WhatsApp\n• Phone\n\n*Goal:* Allow customers to update address, withdraw funds, or confirm account retention."
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📥 Download Report:*\n• <${baseUrl}/api/dormant-accounts?format=csv&type=communication|Warning List CSV>`
          }
        }
      ]
    };
  }

  private createClosureAlert(accounts: AccountActivity[]) {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const avgAge = accounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / accounts.length;
    const oldestAccount = Math.max(...accounts.map(acc => acc.daysSinceCreation));
    
    // Separate historical vs never-active accounts
    const historicalAccounts = accounts.filter(acc => acc.hasActivity);
    const inactiveAccounts = accounts.filter(acc => !acc.hasActivity);
    
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_BASE_URL 
      ? process.env.NEXT_PUBLIC_BASE_URL
      : 'https://your-app.vercel.app';

    let summaryText = `*${accounts.length}* accounts need immediate closure.\n\n*Summary:*\n• Account Count: *${accounts.length}*\n• Total Balance: *${this.formatCurrency(totalBalance)}*\n• Average Age: *${Math.round(avgAge)} days*\n• Oldest Account: *${oldestAccount} days*`;

    // Build CSV download links section
    let csvLinks = "*📥 Download Reports:*\n";
    
    if (historicalAccounts.length > 0) {
      const avgDormancy = Math.round(historicalAccounts.reduce((sum, acc) => sum + acc.daysSinceLastActivity, 0) / historicalAccounts.length);
      summaryText += `\n\n*Historical Accounts (${historicalAccounts.length}):*\n• Previously active accounts now dormant 12+ months\n• Average dormancy: ${avgDormancy} days\n• Balance: ${this.formatCurrency(historicalAccounts.reduce((sum, acc) => sum + acc.balance, 0))}`;
      csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=historical|Historical Accounts CSV (${historicalAccounts.length})>\n`;
    }
    
    if (inactiveAccounts.length > 0) {
      const avgAge = Math.round(inactiveAccounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / inactiveAccounts.length);
      summaryText += `\n\n*Never-Active Accounts (${inactiveAccounts.length}):*\n• No transaction history, 120+ days old\n• Average age: ${avgAge} days\n• Balance: ${this.formatCurrency(inactiveAccounts.reduce((sum, acc) => sum + acc.balance, 0))}`;
      csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=inactive|Never-Active Accounts CSV (${inactiveAccounts.length})>\n`;
    }

    // Remove trailing newline
    csvLinks = csvLinks.trim();

    return {
      text: "⚠️ Account Closure Alert - Final Notice Required",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "⚠️ Account Closure Required - Final Notice"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: summaryText
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Action Required:*\n• Send final closure notification via email\n• Process account closure\n• Handle remaining balance per policy"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: csvLinks
          }
        }
      ]
    };
  }

  async sendDormancyAlert(alert: DormancyAlert): Promise<void> {
    try {
      // Safety check: if too many accounts, send a summary alert instead
      if (alert.accounts.length > 500) {
        console.warn(`Too many dormant accounts (${alert.accounts.length}) - sending summary alert only`);
        await this.sendSummaryAlert(alert);
        return;
      }

      let slackMessage;

      if (alert.type === 'communication_needed') {
        slackMessage = this.createCommunicationAlert(alert.accounts);
      } else {
        slackMessage = this.createClosureAlert(alert.accounts);
      }

      const response = await axios.post(this.webhookUrl, slackMessage, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (response.status !== 200) {
        throw new Error(`Slack API returned status: ${response.status}`);
      }

      console.log(`Successfully sent ${alert.type} alert for ${alert.accounts.length} accounts`);
    } catch (error) {
      console.error('Error sending Slack alert:', error);
      throw error;
    }
  }

  private async sendSummaryAlert(alert: DormancyAlert): Promise<void> {
    const totalBalance = alert.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const avgAge = alert.accounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / alert.accounts.length;
    const oldestAccount = Math.max(...alert.accounts.map(acc => acc.daysSinceCreation));
    
    const alertTitle = alert.type === 'communication_needed' ? 
      '🔔 Large-Scale Communication Alert' : 
      '⚠️ Large-Scale Closure Alert';
    
    const actionText = alert.type === 'communication_needed' ?
      'Send communication attempts to all flagged accounts' :
      'Process closure for all flagged accounts';

    // Try to get the base URL from environment or use a fallback
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_BASE_URL 
      ? process.env.NEXT_PUBLIC_BASE_URL
      : 'https://your-app.vercel.app';

    let csvLinks = '*📥 Download Report:*\n';
    
    if (alert.type === 'communication_needed') {
      csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=communication|Warning List CSV>`;
    } else {
      // For closure alerts, provide separate links for historical and inactive if both exist
      const historicalAccounts = alert.accounts.filter(acc => acc.hasActivity);
      const inactiveAccounts = alert.accounts.filter(acc => !acc.hasActivity);
      
      if (historicalAccounts.length > 0) {
        csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=historical|Historical Accounts CSV (${historicalAccounts.length})>\n`;
      }
      
      if (inactiveAccounts.length > 0) {
        csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=inactive|Never-Active Accounts CSV (${inactiveAccounts.length})>\n`;
      }
      
      if (historicalAccounts.length === 0 || inactiveAccounts.length === 0) {
        // If only one type exists, also provide combined CSV
        csvLinks += `• <${baseUrl}/api/dormant-accounts?format=csv&type=closure|All Closure Accounts CSV>\n`;
      }
    }

    // Remove trailing newline
    csvLinks = csvLinks.trim();

    const slackMessage = {
      text: `${alertTitle} - ${alert.accounts.length} Accounts`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${alertTitle} - ${alert.accounts.length} Accounts`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Account Count:* ${alert.accounts.length}\n*Total Balance:* ${this.formatCurrency(totalBalance)}\n*Average Age:* ${Math.round(avgAge)} days\n*Oldest Account:* ${oldestAccount} days`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Action Required:* ${actionText}\n\n${csvLinks}`
          }
        }
      ]
    };

    await axios.post(this.webhookUrl, slackMessage, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log(`Successfully sent summary alert for ${alert.accounts.length} accounts`);
  }

  async sendStatusMessage(message: string): Promise<void> {
    try {
      const slackMessage = {
        text: message,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🤖 *Account Checker Status*\n\n${message}`
            }
          }
        ]
      };

      await axios.post(this.webhookUrl, slackMessage, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log('Successfully sent status message to Slack');
    } catch (error) {
      console.error('Error sending Slack status message:', error);
      throw error;
    }
  }

  async sendErrorAlert(error: string, details?: string): Promise<void> {
    try {
      const slackMessage = {
        text: "❌ Account Checker Error",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "❌ Account Checker Error"
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error:* ${error}`
            }
          }
        ]
      };

      if (details) {
        slackMessage.blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Details:* \`\`\`${details}\`\`\``
          }
        });
      }

      slackMessage.blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Time:* ${format(new Date(), 'PPpp')}`
        }
      });

      await axios.post(this.webhookUrl, slackMessage, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log('Successfully sent error alert to Slack');
    } catch (slackError) {
      console.error('Error sending Slack error alert:', slackError);
      // Don't throw here to avoid infinite error loops
    }
  }
}

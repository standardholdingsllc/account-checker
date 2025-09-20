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

  private formatAccountList(accounts: AccountActivity[]): string {
    return accounts.map((account, index) => {
      const balanceStr = this.formatCurrency(account.balance);
      const lastActivityStr = account.lastActivity 
        ? format(account.lastActivity, 'MMM dd, yyyy')
        : 'Never';
      
      return `${index + 1}. *${account.customerName}* (ID: ${account.accountId})\n` +
             `   📧 ${account.customerEmail || 'No email'}\n` +
             `   💰 Balance: ${balanceStr}\n` +
             `   📅 Last Activity: ${lastActivityStr}\n` +
             `   ⏰ Days Since Activity: ${account.hasActivity ? account.daysSinceLastActivity : account.daysSinceCreation} days`;
    }).join('\n\n');
  }

  private createCommunicationAlert(accounts: AccountActivity[]) {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    
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
            text: `*${accounts.length}* accounts have been dormant for 9+ months and need communication attempts.\n*Total Balance:* ${this.formatCurrency(totalBalance)}`
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
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Affected Accounts:*\n\n${this.formatAccountList(accounts)}`
          }
        }
      ]
    };
  }

  private createClosureAlert(accounts: AccountActivity[]) {
    const activeAccounts = accounts.filter(acc => acc.hasActivity);
    const inactiveAccounts = accounts.filter(acc => !acc.hasActivity);
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    let alertText = `*${accounts.length}* accounts are ready for closure.\n*Total Balance:* ${this.formatCurrency(totalBalance)}\n\n`;
    
    if (activeAccounts.length > 0) {
      alertText += `*${activeAccounts.length}* accounts with previous activity (12+ months dormant)\n`;
    }
    
    if (inactiveAccounts.length > 0) {
      alertText += `*${inactiveAccounts.length}* accounts with no activity (120+ days old)\n`;
    }

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
            text: alertText
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
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Accounts to Close:*\n\n${this.formatAccountList(accounts)}`
          }
        }
      ]
    };
  }

  async sendDormancyAlert(alert: DormancyAlert): Promise<void> {
    try {
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

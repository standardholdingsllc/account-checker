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

  private formatAccountList(accounts: AccountActivity[], maxAccounts: number = 10): string {
    const accountsToShow = accounts.slice(0, maxAccounts);
    const remainingCount = accounts.length - accountsToShow.length;
    
    let result = accountsToShow.map((account, index) => {
      const balanceStr = this.formatCurrency(account.balance);
      const createdStr = format(account.accountCreated, 'MMM dd, yyyy');
      
      return `${index + 1}. *${account.customerName}* (ID: ${account.accountId})\n` +
             `   💰 Balance: ${balanceStr}\n` +
             `   📅 Created: ${createdStr}\n` +
             `   ⏰ Age: ${account.daysSinceCreation} days old`;
    }).join('\n\n');
    
    if (remainingCount > 0) {
      result += `\n\n... and ${remainingCount} more accounts`;
    }
    
    return result;
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
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    
    // Sort accounts by balance (highest first) to show most important ones
    const sortedAccounts = accounts.sort((a, b) => b.balance - a.balance);
    
    // Calculate statistics
    const avgAge = accounts.reduce((sum, acc) => sum + acc.daysSinceCreation, 0) / accounts.length;
    const oldestAccount = Math.max(...accounts.map(acc => acc.daysSinceCreation));
    const maxAccountsToShow = accounts.length > 20 ? 5 : 10; // Show fewer if too many

    let alertText = `*${accounts.length}* accounts are ready for closure.\n`;
    alertText += `*Total Balance:* ${this.formatCurrency(totalBalance)}\n`;
    alertText += `*Average Age:* ${Math.round(avgAge)} days\n`;
    alertText += `*Oldest Account:* ${oldestAccount} days\n\n`;
    alertText += `*All accounts are 120+ days old* (simplified detection - transaction data unavailable due to API permissions)\n`;
    alertText += `⚠️ *Note:* Using conservative approach based on account creation date only.`;

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
            text: `*Top ${maxAccountsToShow} Accounts by Balance:*\n\n${this.formatAccountList(sortedAccounts, maxAccountsToShow)}`
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
            text: `*Action Required:* ${actionText}\n\n⚠️ *Note:* Too many accounts to list individually. Check logs for detailed account information.`
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

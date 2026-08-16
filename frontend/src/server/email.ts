import { SMTPClient } from "emailjs";

import { getServerIp } from "./get-server-ip";

function parseRecipients(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

class Email {
  private didWarnAboutConfiguration = false;

  async send(subject: string, ...texts: string[]): Promise<boolean> {
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD?.trim();
    const recipients = parseRecipients(
      process.env.EMAIL_ALERT_TO ?? process.env.SIGNUP_EMAIL_TO ?? "s.jahanmard@gmail.com"
    );

    if (!user || !password || recipients.length === 0) {
      if (!this.didWarnAboutConfiguration) {
        console.warn(
          "Email notification skipped: SMTP_USER and SMTP_PASSWORD must be configured"
        );
        this.didWarnAboutConfiguration = true;
      }
      return false;
    }

    const ssl = process.env.SMTP_SSL?.trim().toLowerCase() !== "false";
    const port = Number(process.env.SMTP_PORT || (ssl ? 465 : 587));
    const client = new SMTPClient({
      user,
      password,
      host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
      port,
      ssl,
      tls: !ssl,
      timeout: 10_000
    });

    try {
      await client.sendAsync({
        text: texts.join(" - "),
        from: process.env.SMTP_FROM?.trim() || user,
        to: recipients.join(", "),
        subject
      });
      return true;
    } catch (error) {
      console.error("Email notification failed:", error);
      return false;
    } finally {
      client.smtp.close();
    }
  }

  async sendNewUserSignup(phone: string): Promise<boolean> {
    const subject = `New user signup on server: ${getServerIp()}`;
    return this.send(subject, `A new user signed up with phone number ${phone}`);
  }

  async sendNewOrder(order: {
    id: string;
    title: string;
    order_type: string | null;
    correspondence_email: string;
    university: string;
    customer?: { phone: string | null };
  }): Promise<boolean> {
    const subject = `New order on server: ${getServerIp()}`;
    return this.send(
      subject,
      `Order ID: ${order.id}`,
      `Customer phone: ${order.customer?.phone ?? "unknown"}`,
      `Correspondence email: ${order.correspondence_email}`,
      `Order type: ${order.order_type ?? "unknown"}`,
      `Title: ${order.title}`,
      `University: ${order.university}`
    );
  }
}

export const email = new Email();

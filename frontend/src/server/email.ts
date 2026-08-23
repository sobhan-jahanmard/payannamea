import { Message, SMTPClient } from "emailjs";

import { getServerIp } from "./get-server-ip";
import { formatIranDate } from "./new-followup-report";

const sender = "s.jahanmard@gmail.com";
const recipients = ["s.jahanmard@gmail.com"];

class Email {
  private didWarnAboutConfiguration = false;

  async send(subject: string, ...texts: string[]): Promise<boolean> {
    const password = process.env.SMTP_PASSWORD?.trim();

    if (!password) {
      if (!this.didWarnAboutConfiguration) {
        console.warn(
          "Email notification skipped: SMTP_PASSWORD must be configured",
        );
        this.didWarnAboutConfiguration = true;
      }
      return false;
    }

    const client = new SMTPClient({
      user: sender,
      password,
      host: "smtp.gmail.com",
      port: 465,
      ssl: true,
      timeout: 10_000,
    });
    const text = texts.join(" - ");

    try {
      await client.sendAsync({
        text,
        from: sender,
        to: recipients.join(", "),
        subject,
      });
      console.info("Email notification sent:", { subject, to: recipients });
      return true;
    } catch (error) {
      console.error("Email notification failed:", error);
      return false;
    } finally {
      client.smtp.close();
    }
  }

  async sendHtml(
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    const password = process.env.SMTP_PASSWORD?.trim();

    if (!password) {
      if (!this.didWarnAboutConfiguration) {
        console.warn(
          "Email notification skipped: SMTP_PASSWORD must be configured",
        );
        this.didWarnAboutConfiguration = true;
      }
      return false;
    }

    const client = new SMTPClient({
      user: sender,
      password,
      host: "smtp.gmail.com",
      port: 465,
      ssl: true,
      timeout: 10_000,
    });

    try {
      await client.sendAsync(
        new Message({
          text,
          from: sender,
          to: recipients.join(", "),
          subject,
          attachment: [
            {
              data: html,
              alternative: true,
              contentType: "text/html",
            },
          ],
        }),
      );
      console.info("Email notification sent:", { subject, to: recipients });
      return true;
    } catch (error) {
      console.error("Email notification failed:", error);
      return false;
    } finally {
      client.smtp.close();
    }
  }

  async sendNewUserSignup(phone: string): Promise<boolean> {
    const subject = `New user signup on Payanname Website}`;
    return this.send(
      subject,
      `A new user signed up with phone number ${phone}`,
    );
  }

  async sendNewOrder(order: {
    id: string;
    title: string;
    order_type: string | null;
    correspondence_email: string;
    university: string;
    customer?: { phone: string | null };
  }): Promise<boolean> {
    const subject = `New order on Payanname Website}`;
    return this.send(
      subject,
      `Order ID: ${order.id}`,
      `Customer phone: ${order.customer?.phone ?? "unknown"}`,
      `Correspondence email: ${order.correspondence_email}`,
      `Order type: ${order.order_type ?? "unknown"}`,
      `Title: ${order.title}`,
      `University: ${order.university}`,
    );
  }

  async sendConsultationLead(
    phone: string,
    repeated: boolean,
  ): Promise<boolean> {
    const subject = `Free consultation request on Payanname Website}`;
    return this.send(
      subject,
      `Phone: ${phone}`,
      repeated
        ? "This phone has requested consultation before"
        : "New consultation lead",
    );
  }

  async sendNewFollowupCandidatesReport(
    text: string,
    html: string,
    count: number,
  ): Promise<boolean> {
    const subject = `New follow-up candidates on Payanname Website (${count}) - ${formatIranDate(new Date())}}`;
    return this.sendHtml(subject, text, html);
  }

  async sendContactedFollowupCandidatesReport(
    text: string,
    html: string,
    count: number,
  ): Promise<boolean> {
    const subject = `Contacted follow-up candidates on Payanname Website (${count}) - ${formatIranDate(new Date())}`;
    return this.sendHtml(subject, text, html);
  }
}

export const email = new Email();

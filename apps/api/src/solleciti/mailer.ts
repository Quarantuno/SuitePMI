import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, type SmtpConfig } from '../config';

export interface Messaggio {
  canale: 'email' | 'pec';
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** Astrazione dell'invio: nei test la sostituiamo con una finta che registra i messaggi. */
export abstract class Mailer {
  abstract pecDisponibile(): boolean;
  abstract send(m: Messaggio): Promise<{ messageId: string }>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transports = new Map<string, Transporter>();

  pecDisponibile() {
    return config.pec !== null;
  }

  async send(m: Messaggio) {
    const cfg = m.canale === 'pec' ? config.pec : config.smtp;
    if (!cfg) {
      throw new ServiceUnavailableException(
        "Invio PEC non configurato: imposta PEC_SMTP_* con i dati del tuo gestore, oppure invia la PEC dalla tua casella e segna il sollecito come inviato.",
      );
    }
    const info = await this.transport(m.canale, cfg).sendMail({
      from: cfg.from,
      to: m.to,
      replyTo: m.replyTo,
      subject: m.subject,
      text: m.text,
      attachments: m.attachments,
    });
    return { messageId: info.messageId };
  }

  private transport(key: string, cfg: SmtpConfig): Transporter {
    let t = this.transports.get(key);
    if (!t) {
      t = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      });
      this.transports.set(key, t);
    }
    return t;
  }
}

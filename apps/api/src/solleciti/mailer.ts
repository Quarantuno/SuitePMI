import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, type SmtpConfig } from '../config';

export interface Messaggio {
  aziendaId: string;
  canale: 'email' | 'pec';
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** Astrazione dell'invio: nei test la sostituiamo con una finta che registra i messaggi. */
export abstract class Mailer {
  abstract pecDisponibile(aziendaId: string): boolean;
  emailDisponibile(_aziendaId: string): boolean { return true; }
  abstract send(m: Messaggio): Promise<{ messageId: string }>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transports = new Map<string, Transporter>();

  private autorizzato(aziendaId: string, cfg: SmtpConfig): boolean {
    if (config.mailTenantId) return config.mailTenantId === aziendaId;
    return process.env.NODE_ENV !== 'production'
      && ['127.0.0.1', '::1'].includes(config.apiHost)
      && ['localhost', '127.0.0.1', '::1'].includes(cfg.host)
      && cfg.port === 1025 && !cfg.user && !cfg.pass;
  }

  pecDisponibile(aziendaId: string): boolean {
    return config.pec !== null && this.autorizzato(aziendaId, config.pec);
  }

  override emailDisponibile(aziendaId: string): boolean {
    return this.autorizzato(aziendaId, config.smtp);
  }

  async send(m: Messaggio) {
    const cfg = m.canale === 'pec' ? config.pec : config.smtp;
    if (!cfg || !this.autorizzato(m.aziendaId, cfg)) {
      throw new ServiceUnavailableException(
        "Invio dal server non abilitato per questa azienda. Usa la tua casella e registra l’invio.",
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

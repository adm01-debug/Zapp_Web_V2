export interface GmailMimeAttachment {
  filename: string;
  mimeType: string;
  content: string;
}

export interface GmailMimeOptions {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: GmailMimeAttachment[];
}

function encodeUtf8Base64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

export function encodeBase64Url(value: string): string {
  return encodeUtf8Base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildGmailMimeMessage(options: GmailMimeOptions): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const hasAttachments = Boolean(options.attachments?.length);
  const hasHtml = Boolean(options.htmlBody);
  const headers = [`From: ${options.from}`, `To: ${options.to.join(", ")}`];

  if (options.cc?.length) headers.push(`Cc: ${options.cc.join(", ")}`);
  if (options.bcc?.length) headers.push(`Bcc: ${options.bcc.join(", ")}`);
  headers.push(`Subject: =?UTF-8?B?${encodeUtf8Base64(options.subject)}?=`);
  headers.push(`Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0");
  if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) headers.push(`References: ${options.references}`);

  const appendAlternativeBody = (outerBoundary?: string): string => {
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
    let part = outerBoundary ? `--${outerBoundary}\r\n` : "";
    part += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
    if (options.textBody) {
      part += `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      part += `${encodeUtf8Base64(options.textBody)}\r\n`;
    }
    part += `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    part += `${encodeUtf8Base64(options.htmlBody || "")}\r\n--${altBoundary}--\r\n`;
    return part;
  };

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    let body = `${headers.join("\r\n")}\r\n\r\n`;
    if (hasHtml) body += appendAlternativeBody(boundary);
    else {
      body += `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += `${encodeUtf8Base64(options.textBody || "")}\r\n`;
    }
    for (const attachment of options.attachments || []) {
      body += `--${boundary}\r\nContent-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
      body += `Content-Disposition: attachment; filename="${attachment.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += `${attachment.content}\r\n`;
    }
    return `${body}--${boundary}--`;
  }

  if (hasHtml) {
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    let body = `${headers.join("\r\n")}\r\n\r\n`;
    if (options.textBody) {
      body += `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      body += `${encodeUtf8Base64(options.textBody)}\r\n`;
    }
    body += `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    body += `${encodeUtf8Base64(options.htmlBody || "")}\r\n--${altBoundary}--`;
    return body;
  }

  headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  return `${headers.join("\r\n")}\r\n\r\n${encodeUtf8Base64(options.textBody || "")}`;
}

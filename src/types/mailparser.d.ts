/**
 * Khai báo kiểu tối thiểu cho module mailparser (chưa có @types chính thức).
 * Chỉ khai báo phần API mà dự án sử dụng.
 */
declare module 'mailparser' {
  interface AddressObject {
    value: { address?: string; name?: string }[];
  }

  interface MailAttachment {
    filename?: string;
    contentType?: string;
    content: Buffer;
    size: number;
  }

  interface ParsedMail {
    /** Email envelope (thông tin từ MAIL FROM / RCPT TO). */
    envelope?: {
      from: string | false;
      to: (string | AddressObject)[];
    };
    from?: AddressObject;
    to?: AddressObject;
    subject?: string;
    text?: string | false | null;
    html?: string | false | null;
    attachments: MailAttachment[];
  }

  interface SimpleParserOptions {
    streamAttachments?: boolean;
    skipTextToHtml?: boolean;
    skipHtmlToText?: boolean;
  }

  export function simpleParser(
    source: Buffer,
    options?: SimpleParserOptions,
  ): Promise<ParsedMail>;
}
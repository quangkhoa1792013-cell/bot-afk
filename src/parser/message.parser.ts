/**
 * Message parser: nhận raw email (Buffer) từ SMTP server, dùng mailparser
 * để bóc tách từng trường và trả về cấu trúc để lưu vào DB.
 */
import { simpleParser, type ParsedMail } from 'mailparser';
import { randomUUID } from 'node:crypto';
import { extractOtp, extractActivationLink, extractLinks } from './otp.extractor';
import type { NewMessageInput, NewAttachmentInput } from '../db/mail.repository';

export interface ParsedMessage {
  input: NewMessageInput;
  attachments: NewAttachmentInput[];
}

/**
 * Parse buffer raw (RFC 5322) thành dữ liệu lưu DB.
 * Lưu ý: streamAttachments=true giữ attachment trong memory (Buffer),
 * phù hợp với mail tạm thời kích thước nhỏ/trung bình.
 */
export async function parseRawMessage(raw: Buffer): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(raw, {
    streamAttachments: true,
    // Giữ cả text & html gốc; không sinh thêm text từ html (tiết kiệm CPU)
    skipTextToHtml: true,
    skipHtmlToText: true,
  });

  // Lấy địa chỉ người gửi / người nhận ưu tiên từ envelope (tin cậy hơn header)
  const envelopeFrom = parsed.envelope?.from;
  const envelopeTo = parsed.envelope?.to ?? [];

  const fromAddr = (envelopeFrom && String(envelopeFrom)) ||
    parsed.from?.value?.[0]?.address ||
    '';
  const toAddr = envelopeTo.map((a) => (typeof a === 'string' ? a : a.value?.[0]?.address)).filter(Boolean).join(', ') ||
    parsed.to?.value?.map((a) => a.address).filter(Boolean).join(', ') ||
    '';

  const subject = parsed.subject ?? '';
  // mailparser trả false khi không có text/html => chuyển thành null
  const textBody = parsed.text === false || parsed.text == null ? null : parsed.text;
  const htmlBody = parsed.html === false || parsed.html == null ? null : parsed.html;

  // Trích xuất OTP + link kích hoạt
  const otp = extractOtp(textBody, htmlBody);
  const activationLink = extractActivationLink(textBody, htmlBody);
  const urls = extractLinks(textBody, htmlBody).map((l) => l.href);
  const finalUrls = activationLink && !urls.includes(activationLink)
    ? [activationLink, ...urls]
    : urls;

  // Xử lý attachment trong memory
  const attachments: NewAttachmentInput[] = parsed.attachments.map((att) => ({
    fileName: att.filename || 'attachment',
    contentType: att.contentType || 'application/octet-stream',
    data: att.content,
  }));

  return {
    input: {
      id: randomUUID(),
      toAddr: toAddr || 'unknown@unknown',
      fromAddr: fromAddr || 'unknown@unknown',
      subject,
      textBody,
      htmlBody,
      otp,
      urls: finalUrls.length ? finalUrls : null,
      receivedAt: Date.now(),
    },
    attachments,
  };
}
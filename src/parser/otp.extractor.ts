/**
 * OTP & Link Extractor: tự động tìm mã xác nhận (4-8 chữ số) và link kích hoạt
 * trong nội dung email.
 *
 * Chiến lược:
 *  1. Tìm "vùng keyword" (mã xác nhận, otp, verification code...) rồi lấy số đứng gần
 *  2. Fallback: quét toàn bộ chuỗi 4-8 chữ số đứng độc lập, chấm điểm heuristic
 *  3. Lọc các số giả (năm sinh, ngày tháng, số tiền...)
 */

/** Các keyword làm tăng khả năng 1 chuỗi số là mã OTP. */
const OTP_KEYWORDS =
  /\b(?:otp|mã\s*xác\s*nhận|ma\s*xac\s*nhan|mã\s*kích\s*hoạt|xác\s*minh|verification\s*code|verify\s*code|security\s*code|one-time\s*password|confirmation\s*code|validation\s*code|your\s*code|activation\s*code|captcha)\b/gi;

/** Link "kích hoạt / activate / confirm". */
const ACTIVATION_HINTS = /activate|activation|verify|verification|confirm|confirm_email|kích\s*hoạt|kich\s*hoat|xác\s*nhận|active/gi;

/** Hang các số giả: năm sinh 19xx/20xx. */
function isYearLike(num: string): boolean {
  return /^(19|20)\d{2}$/.test(num);
}

/** Hang số nằm ngay trong ngày tháng (vd: 12/08/2026). */
function isPartOfDate(text: string, index: number, match: string): boolean {
  const before = text.slice(Math.max(0, index - 8), index);
  const after = text.slice(index + match.length, index + match.length + 8);
  return /[\d/.\-:]?\s?[\d/.\-:]?\s?[\d/.\-:]?$/.test(before) && /^[\s/.\-:]*\d{1,2}[\s/.\-:]*\d{2,4}/.test(after) || false;
}

/** Tính điểm cho 1 candidate số OTP dựa trên ngữ cảnh xung quanh. */
function scoreCandidate(text: string, index: number, match: string): { score: number; range: [number, number] } {
  let score = 0;
  const before = text.slice(Math.max(0, index - 80), index).toLowerCase();
  const after = text.slice(index + match.length, index + match.length + 40).toLowerCase();

  // Gần keyword phía trước (<= 80 ký tự) => khả năng cao là OTP
  for (const kw of ['otp', 'mã xác nhận', 'ma xac nhan', 'verification code', 'verify code', 'security code', 'your code', 'your otp', 'code is', 'code:', 'mã:', 'otp:', 'xác nhận', 'la', 'là']) {
    if (before.includes(kw)) {
      score += 6;
      break;
    }
  }

  // Đứng ngay sau dấu ':' hoặc "is" => gần như chắc chắn là mã
  const immediateBefore = text.slice(Math.max(0, index - 12), index).toLowerCase();
  if (/[:=]\s*$/.test(immediateBefore)) score += 4;
  if (/\b(?:is|are)\s*$/.test(immediateBefore)) score += 3;

  // Đứng trước từ "valid" / "expir" (vd: "expires in 5 minutes") => hợp lệ
  if (/expir|valid|hiệu lực|hieu luc/.test(after)) score += 1;

  // Trong làn date/năm => trừ điểm mạnh
  if (isYearLike(match)) score -= 4;
  if (isPartOfDate(text, index, match)) score -= 5;

  // Nếu toàn các chữ số giống nhau (vd 1111) - vẫn là OTP hợp lệ nhưng giảm ưu tiên
  if (/^(\d)\1+$/.test(match)) score -= 1;

  return { score, range: [index, index + match.length] };
}

/** Chuyển HTML thành plaintext thô để quét (giữ luôn thẻ để tìm "mã" trong text). */
function toPlain(text: string | null | undefined, html: string | null | undefined): string {
  if (text && text.trim()) return text;
  if (html) {
    // Loại bỏ style/script rồi bỏ tag, thay bằng khoảng trắng
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }
  return '';
}

/** Bóc mã OTP (4-8 chữ số) từ nội dung email. Trả về null nếu không tìm thấy. */
export function extractOtp(text: string | null | undefined, html: string | null | undefined): string | null {
  const content = toPlain(text, html);
  if (!content.trim()) return null;

  // Bước 1: tìm số đứng ngay sau keyword "mã xác nhận: XXXX"
  const keywordMatches: { match: string; range: [number, number]; score: number }[] = [];
  OTP_KEYWORDS.lastIndex = 0;
  let kwMatch: RegExpExecArray | null;
  while ((kwMatch = OTP_KEYWORDS.exec(content)) !== null) {
    // Quét đoạn <= 60 ký tự sau keyword
    const segment = content.slice(kwMatch.index, kwMatch.index + 60);
    // Ưu tiên pattern "X - 123456" hoặc "X: 123456" hoặc "X 123456"
    for (const numMatch of segment.matchAll(/\b(\d{4,8})\b/g)) {
      const absIndex = kwMatch.index + numMatch.index;
      const { score, range } = scoreCandidate(content, absIndex, numMatch[1]);
      keywordMatches.push({ match: numMatch[1], range, score: score + 5 }); // bonus keyword
    }
  }

  if (keywordMatches.length) {
    keywordMatches.sort((a, b) => b.score - a.score);
    return keywordMatches[0].match;
  }

  // Bước 2: fallback - quét toàn bộ, chấm điểm
  const candidates: { match: string; score: number }[] = [];
  for (const numMatch of content.matchAll(/\b(\d{4,8})\b/g)) {
    if (numMatch.index === undefined) continue;
    const { score } = scoreCandidate(content, numMatch.index, numMatch[1]);
    if (score >= -10) candidates.push({ match: numMatch[1], score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);

  // Chỉ tin nếu điểm cao nhất >= 0; nếu toàn số "nghi ngờ" thì trả về null
  const best = candidates[0];
  return best.score >= 0 ? best.match : null;
}

/** Bóc toàn bộ link http(s). Trả về [{href, isActivation}] với link kích hoạt đứng đầu. */
export function extractLinks(text: string | null | undefined, html: string | null | undefined): { href: string; isActivation: boolean }[] {
  const links: { href: string; isActivation: boolean }[] = [];
  const seen = new Set<string>();

  // Quét trực tiếp attr href trên HTML GỐC (trước khi strip tag)
  // + quét URL thuần trên plaintext
  const rawHtml = html ?? '';
  const plainText = toPlainDescription(text, html);

  const process = (url: string) => {
    const cleaned = url.replace(/[),.;]+$/, '');
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    const isActivation = /activate|verif|confirm|kích\s*hoạt|kich\s*hoat|xác\s*nhận/gi.test(cleaned);
    links.push({ href: cleaned, isActivation });
  };

  let m: RegExpExecArray | null;
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  hrefPattern.lastIndex = 0;
  while ((m = hrefPattern.exec(rawHtml)) !== null) process(m[1]);

  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  urlPattern.lastIndex = 0;
  while ((m = urlPattern.exec(plainText)) !== null) process(m[0]);

  // Link kích hoạt lên trước
  links.sort((a, b) => Number(b.isActivation) - Number(a.isActivation));
  return links;
}

/** Plaintext riêng cho việc tìm URL (nếu có text thì dùng text, không thì strip html). */
function toPlainDescription(text: string | null | undefined, html: string | null | undefined): string {
  if (text && text.trim()) return text;
  if (html) return toPlain(null, html);
  return '';
}

/** Trả link kích hoạt ưu tiên nhất (nếu có). */
export function extractActivationLink(text: string | null | undefined, html: string | null | undefined): string | null {
  const link = extractLinks(text, html).find((l) => l.isActivation);
  return link?.href ?? null;
}
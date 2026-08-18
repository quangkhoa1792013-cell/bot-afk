/**
 * Profile repository: lưu danh sách Profile dạng file JSON (data/profiles.json).
 *
 * Chọn JSON thay vì SQLite vì:
 *  - Dễ copy / di chuyển sang máy khác (chỉ cần copy 1 file, sửa tay được).
 *  - Dữ liệu ít thay đổi (từng Profile), không cần truy vấn phức tạp.
 *
 * File format:
 * {
 *   "version": 1,
 *   "profiles": [
 *     { "id", "name", "assignedEmail", "targetUrl", "notes", "status", "createdAt", "updatedAt" }
 *   ]
 * }
 *
 * Mọi thay đổi ghi file nguyên tử (write tmp + rename) để không hỏng file
 * nếu app thoát đột ngột giữa chừng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../config';

/** Đường dẫn file lưu danh sách Profile. */
export const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

export type ProfileStatus = 'active' | 'inactive';

export interface Profile {
  id: string;
  /** Tên hiển thị, vd: "Discord Bot 01" */
  name: string;
  /** Địa chỉ email được gán cho profile, vd: bot01@khoablabla.ddns.net */
  assignedEmail: string;
  /** URL web local của bot, vd: http://localhost:8080 (để nhúng iframe) */
  targetUrl: string;
  /** Ghi chú tùy ý */
  notes: string;
  /** active | inactive */
  status: ProfileStatus;
  createdAt: number;
  updatedAt: number;
}

/** Payload tạo profile mới. */
export interface NewProfileInput {
  name: string;
  assignedEmail: string;
  targetUrl?: string;
  notes?: string;
  status?: ProfileStatus;
}

/** Payload cập nhật profile (chỉ ghi các field có mặt). */
export type ProfilePatch = Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>;

interface ProfilesFile {
  version: number;
  profiles: Profile[];
}

/** Cache trong bộ nhớ để khỏi đọc file mỗi lần (file nhỏ, dữ liệu ít). */
let cache: Profile[] | null = null;

/** Đọc file (lần đầu) hoặc lấy từ cache. */
function load(): Profile[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const data = JSON.parse(raw) as ProfilesFile;
    cache = Array.isArray(data.profiles) ? data.profiles : [];
  } catch {
    // File chưa tồn tại hoặc hỏng -> khởi đầu với danh sách rỗng
    cache = [];
  }
  return cache;
}

/** Ghi file nguyên tử (tmp + rename). */
function save(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const data: ProfilesFile = { version: 1, profiles: cache ?? [] };
  const tmp = `${PROFILES_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, PROFILES_FILE);
}

/** Tìm profile theo email gán (không phân biệt hoa thường). */
export function findProfilesByEmail(email: string): Profile[] {
  const needle = email.toLowerCase().trim();
  if (!needle) return [];
  return load().filter((p) => p.assignedEmail.toLowerCase() === needle);
}

/** Toàn bộ profile (thứ tự tạo trước ở đầu). */
export function listProfiles(): Profile[] {
  return load();
}

/** Lấy 1 profile theo id, null nếu không tồn tại. */
export function getProfile(id: string): Profile | null {
  return load().find((p) => p.id === id) ?? null;
}

/** Tên profile đã có người dùng chưa (không phân biệt hoa thường). */
export function isNameTaken(name: string, excludeId?: string): boolean {
  const needle = name.trim().toLowerCase();
  return load().some((p) => p.name.toLowerCase() === needle && p.id !== excludeId);
}

/** Email đã gán cho profile khác chưa (không phân biệt hoa thường). */
export function isEmailTaken(email: string, excludeId?: string): boolean {
  const needle = email.toLowerCase().trim();
  return load().some((p) => p.assignedEmail.toLowerCase() === needle && p.id !== excludeId);
}

/**
 * Tạo profile mới.
 * Ném Error('EXISTS_NAME') nếu trùng tên, Error('EXISTS_EMAIL') nếu trùng email.
 */
export function createProfile(input: NewProfileInput): Profile {
  const now = Date.now();
  const profile: Profile = {
    id: randomUUID(),
    name: input.name.trim(),
    assignedEmail: input.assignedEmail.toLowerCase().trim(),
    targetUrl: input.targetUrl?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };

  if (isNameTaken(profile.name)) throw new Error('EXISTS_NAME');
  if (isEmailTaken(profile.assignedEmail)) throw new Error('EXISTS_EMAIL');

  load().push(profile);
  save();
  return profile;
}

/**
 * Cập nhật profile (chỉ các field có mặt). Ném Error('NOT_FOUND'),
 * Error('EXISTS_NAME'), Error('EXISTS_EMAIL').
 */
export function updateProfile(id: string, patch: ProfilePatch): Profile {
  const profiles = load();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('NOT_FOUND');

  const current = profiles[idx];
  const name = patch.name?.trim() ?? current.name;
  const email = (patch.assignedEmail ?? current.assignedEmail).toLowerCase().trim();

  if (isNameTaken(name, id)) throw new Error('EXISTS_NAME');
  if (isEmailTaken(email, id)) throw new Error('EXISTS_EMAIL');

  const updated: Profile = {
    ...current,
    name,
    assignedEmail: email,
    targetUrl: patch.targetUrl?.trim() ?? current.targetUrl,
    notes: patch.notes?.trim() ?? current.notes,
    status: patch.status ?? current.status,
    updatedAt: Date.now(),
  };
  profiles[idx] = updated;
  save();
  return updated;
}

/** Xóa profile theo id. Trả false nếu không tồn tại. */
export function deleteProfile(id: string): boolean {
  const profiles = load();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  profiles.splice(idx, 1);
  save();
  return true;
}

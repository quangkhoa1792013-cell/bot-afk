import { useEffect } from 'react';
import { connectSSE, loadMeta, loadMails, loadProfiles, useStore } from './store';
import Sidebar from './components/Sidebar';
import Profiles from './components/Profiles';
import ProfileWorkspace from './components/ProfileWorkspace';
import Mailboxes from './components/Mailboxes';
import MailList from './components/MailList';
import MailReader from './components/MailReader';
import ComposeModal from './components/ComposeModal';
import SettingsModal from './components/SettingsModal';
import Toasts from './components/Toasts';

/** Bố cục kiểu Gmail: Sidebar 200px + nội dung full-width.
 *  - activeProfileId: đang mở Workspace của 1 Profile (Web-in-Web).
 *  - folder 'profiles': trang Quản lý Profile (CRUD).
 *  - Chưa chọn mail: danh sách 1 dòng ngang trải rộng.
 *  - Bấm 1 mail: ẩn danh sách, mở màn hình đọc full-width (có nút Quay lại).
 *  h-screen overflow-hidden: không bao giờ scroll cả trang. */
export default function App() {
  const folder = useStore((s) => s.folder);
  const selected = useStore((s) => s.selected);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const toasts = useStore((s) => s.toasts);

  useEffect(() => {
    loadMeta();
    loadMails();
    loadProfiles();
    connectSSE();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1115] text-gray-200">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {activeProfileId && !selected ? (
          <ProfileWorkspace />
        ) : folder === 'profiles' ? (
          <Profiles />
        ) : folder === 'mailboxes' ? (
          <Mailboxes />
        ) : selected ? (
          <MailReader />
        ) : (
          <MailList />
        )}
      </main>
      <ComposeModal />
      <SettingsModal />
      <Toasts toasts={toasts} />
    </div>
  );
}
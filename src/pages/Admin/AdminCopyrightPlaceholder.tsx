import { AdminPanelLayout } from './ui/AdminPanelLayout';

export default function AdminCopyrightPlaceholder() {
  return (
    <AdminPanelLayout title="Copyright" subtitle="Placeholder — no functionality yet.">
      <p className="admin-panel__placeholder">
        This section will host copyright tools. For now it is a static placeholder.
      </p>
    </AdminPanelLayout>
  );
}

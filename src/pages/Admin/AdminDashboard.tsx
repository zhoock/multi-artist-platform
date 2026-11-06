import { AdminPanelLayout } from './ui/AdminPanelLayout';

export default function AdminDashboard() {
  return (
    <AdminPanelLayout title="Admin Dashboard">
      <div className="admin-panel__grid">
        <div className="admin-panel__stat">
          <div className="admin-panel__stat-label">Copyright</div>
          <div className="admin-panel__stat-value">0 open claims</div>
        </div>
        <div className="admin-panel__stat">
          <div className="admin-panel__stat-label">Notifications</div>
          <div className="admin-panel__stat-value">0 unread</div>
        </div>
      </div>
    </AdminPanelLayout>
  );
}

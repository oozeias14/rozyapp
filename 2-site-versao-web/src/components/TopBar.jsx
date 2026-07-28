export default function TopBar({ totalUsers }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="dot" />
        <span style={{ fontSize: 13 }}>Amigos da Rozy Costa</span>
      </div>
      <div className="pill">🌐 <b>{totalUsers}</b></div>
    </div>
  );
}

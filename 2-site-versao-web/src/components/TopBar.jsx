export default function TopBar({ totalUsers }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="dot" />
        <span style={{ fontSize: 13 }}>Amigos Dr Candido</span>
      </div>
      <div className="pill">🌐 <b>{totalUsers}</b></div>
    </div>
  );
}

export const COLORS = {
  bg: '#05070B',
  panel: '#121826',
  panel2: '#1A2235',
  line: '#232C40',
  ink1: '#F0F4FA',
  ink2: '#8A94A8',
  ink3: '#56627A',
  teal: '#3DD9B3',
  tealDim: 'rgba(61,217,179,0.14)',
  violet: '#7B6CF4',
  violetDim: 'rgba(123,108,244,0.15)',
  warn: '#F06B4C',
  gold: '#E8C547',
};

export const S = {
  screen: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50, paddingHorizontal: 16 },
  card: { backgroundColor: COLORS.panel, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 18, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 11, color: COLORS.ink2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { color: COLORS.ink2, fontSize: 12.5, lineHeight: 18 },
  label: { color: COLORS.ink2, fontSize: 11, marginBottom: 4, marginLeft: 2, textTransform: 'uppercase' },
  input: { backgroundColor: COLORS.panel2, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.08)', color: COLORS.ink1, padding: 12, borderRadius: 12, marginBottom: 12 },
  btn: { padding: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  btnTeal: { backgroundColor: COLORS.teal },
  btnViolet: { backgroundColor: COLORS.violet },
  btnGhost: { backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.line },
  btnWarn: { backgroundColor: 'rgba(240,107,76,0.15)', borderWidth: 1, borderColor: 'rgba(240,107,76,0.35)' },
  btnTextDark: { color: '#051A14', fontWeight: '700' },
  btnTextLight: { color: '#fff', fontWeight: '700' },
  btnTextGhost: { color: COLORS.ink1, fontWeight: '700' },
  btnTextWarn: { color: COLORS.warn, fontWeight: '700' },
  idBadge: { fontFamily: 'monospace', fontSize: 10, color: COLORS.ink2, backgroundColor: COLORS.panel2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  roleBadge: { fontSize: 9, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', textTransform: 'uppercase' },
  roleAdmin: { backgroundColor: 'rgba(232,197,71,0.18)', color: COLORS.gold },
  roleCoord: { backgroundColor: COLORS.violetDim, color: COLORS.violet },
  roleUser: { backgroundColor: COLORS.tealDim, color: COLORS.teal },
};

export function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'coord') return 'Coord';
  return 'Membro';
}
export function roleStyle(role) {
  if (role === 'admin') return S.roleAdmin;
  if (role === 'coord') return S.roleCoord;
  return S.roleUser;
}

function Accounts() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name:'', account_type:'cash' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: d } = await sb.from('accounts').select('*').order('created_at').limit(500);
    setData(d||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    // P2A-07: balance field removed from form.
    // Accounts are always created with balance=0.
    // Any opening balance must be added via a manual financial movement
    // (record_financial_movement_atomic) so it appears in financial_movements
    // and is included in reconciliation views.
    await sb.from('accounts').insert([{ name:form.name, account_type:form.account_type, balance:0 }]);
    setModal(false); setForm({ name:'', account_type:'cash' });
    await load(); setSaving(false);
  };

  const typeLabel = { cash:'كاش', bank:'بنك', mobile_wallet:'محفظة' };
  const typeColor = { cash:'badge-green', bank:'badge-blue', mobile_wallet:'badge-purple' };

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">الحسابات المالية</span>
          <button className="topbar-btn btn-primary" onClick={()=>setModal(true)}>
            <Icon d={Icons.plus}/> إضافة حساب
          </button>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : data.length === 0
          ? <Empty icon="🏦" title="لا توجد حسابات"/>
          : <table className="table">
              <thead><tr><th>الحساب</th><th>النوع</th><th>الرصيد الحالي</th></tr></thead>
              <tbody>{data.map(a=>(
                <tr key={a.id}>
                  <td style={{fontWeight:600}}>{a.name}</td>
                  <td><span className={`badge ${typeColor[a.account_type]||'badge-gray'}`}>{typeLabel[a.account_type]||a.account_type}</span></td>
                  <td style={{color:'var(--green)',fontWeight:600,fontSize:15}}>{fmt(a.balance)}</td>
                </tr>
              ))}</tbody>
            </table>
          }
        </div>
      </div>
      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title">إضافة حساب مالي</span>
            <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">اسم الحساب</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="مثال: CIB"/></div>
            <div className="form-group"><label className="form-label">النوع</label>
              <select className="form-select" value={form.account_type} onChange={e=>setForm({...form,account_type:e.target.value})}>
                <option value="cash">كاش / خزنة</option>
                <option value="bank">حساب بنكي</option>
                <option value="mobile_wallet">محفظة موبايل</option>
              </select>
            </div>
            {/* P2A-07: Opening balance field removed.
                 Add opening balance after account creation via a manual financial movement.
                 This ensures every balance appears in financial_movements and reconciliation. */}
            <div className="form-group">
              <div style={{fontSize:12,color:'var(--text3)',background:'var(--bg3)',borderRadius:8,padding:'8px 12px',lineHeight:1.6}}>
                💡 الحساب يُنشأ برصيد صفر. لإضافة رصيد افتتاحي، أنشئ حركة مالية يدوية من نوع <strong>إيداع</strong> بعد حفظ الحساب.
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={save} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

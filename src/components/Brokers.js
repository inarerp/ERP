function Brokers({ navigateSub, navigateBack, subId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name:'', phone:'', email:'', notes:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dupMatches, setDupMatches] = useState(null);

  const load = useCallback(async () => {
    const { data: d } = await sb.from('brokers').select('*').order('created_at').limit(500);
    setData(d||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const checkAndSave = async () => {
    if (!form.name.trim()) { setErrors({name:true}); return; }
    if (saving) return;
    setSaving(true);
    try {
      const newMatches = await findDuplicatePartiesForRole(form.name, form.phone, form.email, 'broker');
      if (newMatches.length > 0) { setDupMatches(newMatches); setSaving(false); return; }
      await doCreate();
    } catch(err) { showError(err, 'إضافة وسيط'); setSaving(false); }
  };

  const addRoleToExisting = async (party) => {
    setSaving(true);
    try {
      await callRpc('create_broker_atomic', {
        p_name: party.name, p_phone: form.phone||null,
        p_email: form.email||null, p_notes: form.notes||null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', phone:'', email:'', notes:'' }); await load();
    } catch(err) { showError(err, 'إضافة دور وسيط'); }
    finally { setSaving(false); }
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      await callRpc('create_broker_atomic', {
        p_name: form.name.trim(), p_phone: form.phone||null,
        p_email: form.email||null, p_notes: form.notes||null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', phone:'', email:'', notes:'' }); setErrors({}); await load();
    } catch(err) { showError(err, 'إضافة وسيط'); }
    finally { setSaving(false); }
  };

  if (subId) return <BrokerDetail brokerId={subId} onBack={()=>{ navigateBack('brokers'); load(); }}/>;

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">الوسطاء</span>
          <button className="topbar-btn btn-primary" onClick={()=>{ setForm({ name:'', phone:'', email:'', notes:'' }); setErrors({}); setModal(true); }}>
            <Icon d={Icons.plus}/> إضافة وسيط
          </button>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : data.length===0
          ? <Empty icon="🤝" title="لا يوجد وسطاء"/>
          : <table className="table">
              <thead><tr><th>الاسم</th><th>الهاتف</th><th>العمولات المستحقة</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
              <tbody>{data.map(b=>(
                <tr key={b.id} onClick={()=>navigateSub('brokers',b.id)} style={{cursor:'pointer'}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:10}}><div className="avatar" style={{background:'var(--purple)'}}>{b.name[0]}</div><span style={{fontWeight:600,color:'var(--accent)'}}>{b.name}</span></div></td>
                  <td style={{color:'var(--text2)'}}>{b.phone||'—'}</td>
                  <td style={{color:'var(--amber)'}}>{fmt(b.commission_due)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(b.commission_paid)}</td>
                  <td style={{color:Number(b.commission_due)-Number(b.commission_paid)>0?'var(--red)':'var(--green)'}}>{fmt(Number(b.commission_due)-Number(b.commission_paid))}</td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة وسيط جديد</span><button className="modal-close" onClick={()=>setModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">الاسم <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" style={errors.name?{borderColor:'var(--red)'}:{}} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setErrors({});}} placeholder="اسم الوسيط"/>
              {errors.name && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>هذا الحقل مطلوب</div>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">الهاتف</label>
                <input className="form-input" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="01xxxxxxxxx"/>
              </div>
              <div className="form-group"><label className="form-label">البريد الإلكتروني</label>
                <input className="form-input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com"/>
              </div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={checkAndSave} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}
      {dupMatches && <PartyDuplicateModal
        matches={dupMatches} roleName="وسيط"
        onAddRole={addRoleToExisting}
        onCreateNew={()=>{ setDupMatches(null); doCreate(); }}
        onCancel={()=>{ setDupMatches(null); setSaving(false); }}
      />}
    </div>
  );
}

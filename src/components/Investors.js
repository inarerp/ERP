function Investors({ navigateSub, navigateBack, subId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name:'', phone:'', email:'', funding_capacity:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dupMatches, setDupMatches] = useState(null);

  const load = useCallback(async () => {
    const { data: d } = await sb.from('investors').select('*').order('created_at').limit(500);
    setData(d||[]); setLoading(false);
  }, []);
  useEffect(()=>{ load(); },[load]);

  const openModal = () => {
    setForm({ name:'', phone:'', email:'', funding_capacity:'' });
    setErrors({}); setDupMatches(null); setModal(true);
  };

  const checkAndSave = async () => {
    if (!form.name.trim()) { setErrors({name:true}); return; }
    if (saving) return;
    setSaving(true);
    try {
      const newMatches = await findDuplicatePartiesForRole(form.name, form.phone, form.email, 'investor');
      if (newMatches.length > 0) {
        setDupMatches(newMatches); setSaving(false); return;
      }
      await doCreate();
    } catch(err) { showError(err, 'إضافة ممول'); setSaving(false); }
  };

  const addRoleToExisting = async (party) => {
    setSaving(true);
    try {
      await callRpc('create_investor_atomic', {
        p_name: party.name, p_phone: form.phone||null,
        p_email: form.email||null,
        p_funding_capacity: Number(form.funding_capacity)||0, p_notes: null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', phone:'', email:'', funding_capacity:'' });
      await load();
    } catch(err) { showError(err, 'إضافة دور ممول'); }
    finally { setSaving(false); }
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      await callRpc('create_investor_atomic', {
        p_name: form.name.trim(), p_phone: form.phone||null,
        p_email: form.email||null,
        p_funding_capacity: Number(form.funding_capacity)||0, p_notes: null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', phone:'', email:'', funding_capacity:'' }); setErrors({});
      await load();
    } catch(err) { showError(err, 'إضافة ممول'); }
    finally { setSaving(false); }
  };

  if (subId) return <InvestorDetail investorId={subId} onBack={()=>{ navigateBack('investors'); load(); }}/>;

  // P5: client-side search
  const filteredInv = data.filter(i =>
    !search ||
    (i.name||'').toLowerCase().includes(search.toLowerCase()) ||
    (i.phone||'').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">الممولون ({filteredInv.length})</span>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <input className="form-input" style={{width:180,fontSize:13}}
              placeholder="بحث بالاسم أو الهاتف..."
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <button className="topbar-btn btn-primary" onClick={()=>{ setForm({ name:'', phone:'', email:'', funding_capacity:'' }); setErrors({}); setModal(true); }}>
              <Icon d={Icons.plus}/> إضافة ممول
            </button>
          </div>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : filteredInv.length === 0
          ? <Empty icon="💰" title={search ? 'لا توجد نتائج' : 'لا يوجد ممولون'}/>
          : <table className="table">
              <thead><tr><th>الاسم</th><th>الهاتف</th><th>القدرة التمويلية</th><th>الرصيد المتاح</th><th>الأرباح المستحقة</th><th>الأرباح المدفوعة</th></tr></thead>
              <tbody>{filteredInv.map(inv=>(
                <tr key={inv.id} onClick={()=>navigateSub('investors',inv.id)} style={{cursor:'pointer'}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:10}}><div className="avatar">{inv.name[0]}</div><span style={{fontWeight:600,color:'var(--accent)'}}>{inv.name}</span></div></td>
                  <td style={{color:'var(--text2)'}}>{inv.phone||'—'}</td>
                  <td>{fmt(inv.funding_capacity)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(inv.available_balance)}</td>
                  <td style={{color:'var(--amber)'}}>{fmt(inv.profit_due)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(inv.profit_paid)}</td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة ممول جديد</span><button className="modal-close" onClick={()=>setModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">الاسم <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" style={errors.name?{borderColor:'var(--red)'}:{}} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setErrors({});}} placeholder="اسم الممول"/>
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
            <div className="form-group">
              <label className="form-label">القدرة التمويلية (ج.م)</label>
              <input className="form-input" type="number" value={form.funding_capacity} onChange={e=>setForm({...form,funding_capacity:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>الحد الأقصى الذي يستطيع تمويله — لا يُحتسب رصيداً إلا بعد الإيداع الفعلي</div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={checkAndSave} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}
      {dupMatches && <PartyDuplicateModal
        matches={dupMatches}
        roleName="ممول"
        onAddRole={addRoleToExisting}
        onCreateNew={()=>{ setDupMatches(null); doCreate(); }}
        onCancel={()=>{ setDupMatches(null); setSaving(false); }}
      />}
    </div>
  );
}

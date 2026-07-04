function Clients({ navigateSub, navigateBack, subId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [deals, setDeals] = useState([]);
  const [form, setForm] = useState({ name:'', contact_name:'', phone:'', email:'', address:'', notes:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dupMatches, setDupMatches] = useState(null);

  const load = useCallback(async () => {
    const { data: d } = await sb.from('clients').select('*').order('created_at').limit(500);
    setData(d||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  // تحميل تفاصيل العميل عند تغيّر subId (يدعم Back/Forward في المتصفح
  // بنفس نمط Entities/Investors/Brokers بدل حالة selected محلية فقط)
  useEffect(() => {
    if (!subId) { setSelected(null); return; }
    (async () => {
      const [{ data: c },{ data: d }] = await Promise.all([
        sb.from('clients').select('*').eq('id', subId).single(),
        sb.from('deals').select('*, entities(name)').eq('client_id', subId).order('created_at',{ascending:false}),
      ]);
      setSelected(c); setDeals(d||[]);
    })();
  }, [subId]);

  const checkAndSave = async () => {
    if (!form.name.trim()) { setErrors({name:true}); return; }
    if (saving) return;
    setSaving(true);
    try {
      const newMatches = await findDuplicatePartiesForRole(form.name, form.phone, form.email, 'client');
      if (newMatches.length > 0) { setDupMatches(newMatches); setSaving(false); return; }
      await doCreate();
    } catch(err) { showError(err, 'إضافة عميل'); setSaving(false); }
  };

  const addRoleToExisting = async (party) => {
    setSaving(true);
    try {
      await callRpc('create_client_atomic', {
        p_name: party.name, p_contact_name: form.contact_name||null,
        p_phone: form.phone||null, p_email: form.email||null,
        p_address: form.address||null, p_notes: form.notes||null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', contact_name:'', phone:'', email:'', address:'', notes:'' }); await load();
    } catch(err) { showError(err, 'إضافة دور عميل'); }
    finally { setSaving(false); }
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      await callRpc('create_client_atomic', {
        p_name: form.name.trim(), p_contact_name: form.contact_name||null,
        p_phone: form.phone||null, p_email: form.email||null,
        p_address: form.address||null, p_notes: form.notes||null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', contact_name:'', phone:'', email:'', address:'', notes:'' }); setErrors({}); await load();
    } catch(err) { showError(err, 'إضافة عميل'); }
    finally { setSaving(false); }
  };

  if (subId) return selected ? (
    <div className="content">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="topbar-btn btn-ghost" onClick={()=>navigateBack('clients')}>← رجوع</button>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:3}}>{selected.name}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{selected.phone||''} {selected.email?'· '+selected.email:''} {selected.address?'· '+selected.address:''}</div>
        </div>
      </div>
      <div className="stats-grid" style={{marginBottom:20}}>
        <StatCard label="إجمالي العمليات" valueClass="blue" value={deals.length}/>
        <div className="stat-card">
          <div className="stat-label">إجمالي القيمة</div>
          <div className="stat-value">{fmtShort(deals.reduce((a,d)=>a+Number(d.value||0),0))}</div>
        </div>
        <StatCard label="تم التحصيل الكامل" valueClass="green" value={deals.filter(d=>d.status==='fully_collected'||d.status==='closed').length}/>
      </div>
      <div className="section">
        <div className="section-header"><span className="section-title">العمليات مع {selected.name}</span></div>
        {deals.length===0
          ? <Empty icon="📋" title="لا توجد عمليات"/>
          : <table className="table">
              <thead><tr><th>الرقم</th><th>الاسم</th><th>الكيان</th><th>القيمة</th><th>الحالة</th></tr></thead>
              <tbody>{deals.map(d=>(
                <tr key={d.id}>
                  <td style={{fontFamily:'monospace',fontSize:12,color:'var(--text2)'}}>{d.deal_number}</td>
                  <td style={{fontWeight:600}}>{d.name}</td>
                  <td>{d.entities?.name||'—'}</td>
                  <td>{fmt(d.value)}</td>
                  <td><span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:'—'}).label}</span></td>
                </tr>
              ))}</tbody>
            </table>}
      </div>
    </div>
  ) : <Loading/>;

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">العملاء</span>
          <button className="topbar-btn btn-primary" onClick={()=>{ setForm({ name:'', contact_name:'', phone:'', email:'', address:'', notes:'' }); setErrors({}); setModal(true); }}>
            <Icon d={Icons.plus}/> إضافة عميل
          </button>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : data.length===0
          ? <Empty icon="🏪" title="لا يوجد عملاء"/>
          : <table className="table">
              <thead><tr><th>الاسم</th><th>جهة الاتصال</th><th>الهاتف</th><th>العنوان</th></tr></thead>
              <tbody>{data.map(c=>(
                <tr key={c.id} onClick={()=>navigateSub('clients',c.id)} style={{cursor:'pointer'}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:10}}><div className="avatar" style={{background:'var(--purple)'}}>{c.name[0]}</div><span style={{fontWeight:600,color:'var(--accent)'}}>{c.name}</span></div></td>
                  <td style={{color:'var(--text2)'}}>{c.contact_name||'—'}</td>
                  <td style={{color:'var(--text2)'}}>{c.phone||'—'}</td>
                  <td style={{color:'var(--text2)'}}>{c.address||'—'}</td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة عميل جديد</span><button className="modal-close" onClick={()=>setModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">اسم العميل / الجهة <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" style={errors.name?{borderColor:'var(--red)'}:{}} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setErrors({});}} placeholder="مثال: ريتش بيك"/>
              {errors.name && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>هذا الحقل مطلوب</div>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">جهة الاتصال</label>
                <input className="form-input" value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})} placeholder="اسم المسؤول"/>
              </div>
              <div className="form-group"><label className="form-label">الهاتف</label>
                <input className="form-input" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="01xxxxxxxxx"/>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">البريد الإلكتروني</label>
                <input className="form-input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com"/>
              </div>
              <div className="form-group"><label className="form-label">العنوان</label>
                <input className="form-input" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="العنوان"/>
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
        matches={dupMatches} roleName="عميل"
        onAddRole={addRoleToExisting}
        onCreateNew={()=>{ setDupMatches(null); doCreate(); }}
        onCancel={()=>{ setDupMatches(null); setSaving(false); }}
      />}
    </div>
  );
}

function Entities({ navigateSub, navigateBack, subId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name:'', type:'company', notes:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dupMatches, setDupMatches] = useState(null); // نافذة التكرار

  const load = useCallback(async () => {
    const { data: d } = await sb.from('entities').select('*').order('created_at').limit(500);
    setData(d||[]); setLoading(false);
  }, []);
  useEffect(()=>{ load(); },[load]);

  const openModal = () => {
    setForm({ name:'', type:'company', notes:'' });
    setErrors({}); setDupMatches(null); setModal(true);
  };

  // خطوة 1: التحقق من وجود طرف مشابه قبل الحفظ
  const checkAndSave = async () => {
    if (!form.name.trim()) { setErrors({name:true}); return; }
    if (saving) return;
    setSaving(true);
    try {
      const newMatches = await findDuplicatePartiesForRole(form.name, null, null, 'entity');
      if (newMatches.length > 0) {
        setDupMatches(newMatches);
        setSaving(false);
        return;
      }
      await doCreate();
    } catch(err) {
      showError(err, 'إضافة كيان');
      setSaving(false);
    }
  };

  // إضافة دور entity لـ party موجود
  const addRoleToExisting = async (party) => {
    setSaving(true);
    try {
      // نُنشئ entity جديد ويربطه الـ RPC بنفس الـ party تلقائياً (upsert_party_role)
      await callRpc('create_entity_atomic', {
        p_name:  party.name,
        p_type:  form.type || 'company',
        p_notes: form.notes || null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', type:'company', notes:'' });
      await load();
    } catch(err) { showError(err, 'إضافة دور كيان'); }
    finally { setSaving(false); }
  };

  // إنشاء جديد بشكل طبيعي
  const doCreate = async () => {
    setSaving(true);
    try {
      await callRpc('create_entity_atomic', {
        p_name:  form.name.trim(),
        p_type:  form.type  || 'company',
        p_notes: form.notes || null,
      });
      setModal(false); setDupMatches(null);
      setForm({ name:'', type:'company', notes:'' }); setErrors({});
      await load();
    } catch(err) { showError(err, 'إضافة كيان'); }
    finally { setSaving(false); }
  };

  if (subId) return <EntityDetail entityId={subId} onBack={()=>{ navigateBack('entities'); load(); }}/>;

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">الكيانات المالية</span>
          <button className="topbar-btn btn-primary" onClick={()=>{ setForm({ name:'', type:'company', notes:'' }); setErrors({}); setModal(true); }}>
            <Icon d={Icons.plus}/> إضافة كيان
          </button>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : data.length === 0
          ? <Empty icon="🏢" title="لا توجد كيانات"/>
          : <table className="table">
              <thead><tr><th>الاسم</th><th>النوع</th><th>ملاحظات</th><th>تاريخ الإضافة</th></tr></thead>
              <tbody>{data.map(e=>(
                <tr key={e.id} onClick={()=>navigateSub('entities',e.id)} style={{cursor:'pointer'}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:10}}><div className="avatar">{e.name[0]}</div><span style={{fontWeight:600,color:'var(--accent)'}}>{e.name}</span></div></td>
                  <td><span className="badge badge-blue">{e.type==='company'?'شركة':'فرد'}</span></td>
                  <td style={{color:'var(--text2)'}}>{e.notes||'—'}</td>
                  <td style={{color:'var(--text2)'}}>{new Date(e.created_at).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إضافة كيان جديد</span><button className="modal-close" onClick={()=>setModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">اسم الكيان <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" style={errors.name?{borderColor:'var(--red)'}:{}} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setErrors({});}} placeholder="مثال: شركة إينار"/>
              {errors.name && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>هذا الحقل مطلوب</div>}
            </div>
            <div className="form-group"><label className="form-label">النوع</label>
              <select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                <option value="company">شركة</option>
                <option value="individual">فرد / مهندس</option>
              </select>
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
        matches={dupMatches}
        roleName="كيان"
        onAddRole={addRoleToExisting}
        onCreateNew={()=>{ setDupMatches(null); doCreate(); }}
        onCancel={()=>{ setDupMatches(null); setSaving(false); }}
      />}
    </div>
  );
}

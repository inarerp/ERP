function Parties({ navigateSub, navigateBack, subId }) {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dupMatches, setDupMatches] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [addRoles, setAddRoles] = useState([]);
  const [addForm, setAddForm] = useState({name:'',type:'company',phone:'',email:'',address:'',notes:'',funding_capacity:''});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const {data} = await sb.from('v_parties_unified').select('*').order('name');
    setParties(data||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  if(subId) return <PartyProfile partyId={subId} onBack={()=>navigateBack('parties')} navigateSub={navigateSub}/>;

  const filtered = parties.filter(p=>{
    const matchRole = roleFilter==='all'
      || (roleFilter==='investor'&&p.is_investor)
      || (roleFilter==='entity'&&p.is_entity)
      || (roleFilter==='broker'&&p.is_broker)
      || (roleFilter==='client'&&p.is_client);
    const s = search.toLowerCase();
    const matchSearch = !search
      || (p.name||'').toLowerCase().includes(s)
      || (p.phone||'').includes(s)
      || (p.email||'').toLowerCase().includes(s);
    return matchRole && matchSearch;
  });

  const roleColors = {investor:'role-investor',entity:'role-entity',broker:'role-broker',client:'role-client'};
  const roleLabels = {investor:'ممول',entity:'كيان',broker:'وسيط',client:'عميل'};

  const checkAndAdd = async () => {
    if(!addForm.name.trim()) return;
    if(addRoles.length===0) { showError(new Error('اختر دوراً واحداً على الأقل'),'إضافة'); return; }
    setSaving(true);
    try {
      const matches = await searchExistingParty(addForm.name, addForm.phone, addForm.email);
      if(matches.length>0){ setDupMatches(matches); setSaving(false); return; }
      await doCreate();
    } catch(err){ showError(err,'إضافة طرف'); setSaving(false); }
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      for(const role of addRoles){
        if(role==='investor') await callRpc('create_investor_atomic',{p_name:addForm.name.trim(),p_phone:addForm.phone||null,p_email:addForm.email||null,p_funding_capacity:Number(addForm.funding_capacity)||0,p_notes:addForm.notes||null});
        if(role==='entity')   await callRpc('create_entity_atomic',{p_name:addForm.name.trim(),p_type:addForm.type,p_notes:addForm.notes||null});
        if(role==='broker')   await callRpc('create_broker_atomic',{p_name:addForm.name.trim(),p_phone:addForm.phone||null,p_email:addForm.email||null,p_notes:addForm.notes||null});
        if(role==='client')   await callRpc('create_client_atomic',{p_name:addForm.name.trim(),p_contact_name:null,p_phone:addForm.phone||null,p_email:addForm.email||null,p_address:addForm.address||null,p_notes:addForm.notes||null});
      }
      setAddModal(false); setDupMatches(null);
      setAddForm({name:'',type:'company',phone:'',email:'',address:'',notes:'',funding_capacity:''});
      setAddRoles([]);
      await load();
    } catch(err){ showError(err,'إضافة طرف'); }
    finally{ setSaving(false); }
  };

  const addRoleToExisting = async (party) => {
    setSaving(true);
    try {
      for(const role of addRoles){
        if(role==='investor') await callRpc('create_investor_atomic',{p_name:party.name,p_phone:addForm.phone||null,p_email:addForm.email||null,p_funding_capacity:Number(addForm.funding_capacity)||0,p_notes:null});
        if(role==='entity')   await callRpc('create_entity_atomic',{p_name:party.name,p_type:addForm.type,p_notes:null});
        if(role==='broker')   await callRpc('create_broker_atomic',{p_name:party.name,p_phone:addForm.phone||null,p_email:addForm.email||null,p_notes:null});
        if(role==='client')   await callRpc('create_client_atomic',{p_name:party.name,p_contact_name:null,p_phone:addForm.phone||null,p_email:addForm.email||null,p_address:addForm.address||null,p_notes:null});
      }
      setAddModal(false); setDupMatches(null); setAddRoles([]);
      await load();
    } catch(err){ showError(err,'إضافة دور'); }
    finally{ setSaving(false); }
  };

  const toggleRole = r => setAddRoles(prev=>prev.includes(r)?prev.filter(x=>x!==r):[...prev,r]);

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">الأطراف — {filtered.length} طرف</span>
          <button className="topbar-btn btn-primary" onClick={()=>setAddModal(true)}>
            <Icon d={Icons.plus}/> إضافة طرف
          </button>
        </div>

        {/* فلاتر الأدوار + بحث */}
        <div className="parties-filter-bar">
          {['all','investor','entity','broker','client'].map(r=>(
            <button key={r} className={`role-filter-btn ${roleFilter===r?'active':''}`} onClick={()=>setRoleFilter(r)}>
              {{all:'الكل',investor:'الممولون',entity:'الكيانات',broker:'الوسطاء',client:'العملاء'}[r]}
            </button>
          ))}
          <div style={{flex:1}}/>
          <input className="form-input" style={{maxWidth:200,padding:'6px 12px',fontSize:12}}
            placeholder="بحث بالاسم أو التليفون..."
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <div className="section-body">
          {loading ? <Loading/> : filtered.length===0
            ? <Empty icon="👤" title="لا توجد أطراف" sub={search?'لا نتائج للبحث':'أضف طرفاً جديداً للبدء'}/>
            : filtered.map(p=>(
              <div key={p.id} className="party-list-item" onClick={()=>navigateSub('parties',p.id)}>
                <div className="party-mini-avatar">{(p.name||'؟').slice(0,2)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{p.name}</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {p.is_investor&&<span className="role-pill role-investor">ممول</span>}
                    {p.is_entity  &&<span className="role-pill role-entity">كيان</span>}
                    {p.is_broker  &&<span className="role-pill role-broker">وسيط</span>}
                    {p.is_client  &&<span className="role-pill role-client">عميل</span>}
                  </div>
                </div>
                <div style={{textAlign:'left',flexShrink:0}}>
                  {p.phone&&<div style={{fontSize:12,color:'var(--text2)'}}>{p.phone}</div>}
                  {p.email&&<div style={{fontSize:11,color:'var(--text3)'}}>{p.email}</div>}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Add Party Modal */}
      {addModal && <Modal title="إضافة طرف جديد" onClose={()=>{setAddModal(false);setAddRoles([]);}} onSave={checkAndAdd} saving={saving} saveLabel="إضافة">
        <Field label="الاسم" required>
          <Input value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} placeholder="اسم الشخص أو الشركة"/>
        </Field>
        <Field label="الأدوار" required hint="يمكن اختيار أكثر من دور">
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
            {['investor','entity','broker','client'].map(r=>(
              <button key={r} type="button"
                onClick={()=>toggleRole(r)}
                style={{padding:'6px 14px',borderRadius:20,border:'1px solid',fontSize:13,cursor:'pointer',
                  fontFamily:'Cairo,sans-serif',transition:'all .15s',
                  background:addRoles.includes(r)?'var(--accent)':'var(--bg3)',
                  borderColor:addRoles.includes(r)?'var(--accent)':'var(--border)',
                  color:addRoles.includes(r)?'white':'var(--text2)',
                }}>
                {addRoles.includes(r)?'✓ ':''}{roleLabels[r]}
              </button>
            ))}
          </div>
        </Field>
        {addRoles.includes('entity')&&<Field label="نوع الكيان">
          <Select value={addForm.type} onChange={e=>setAddForm({...addForm,type:e.target.value})}
            options={[{value:'company',label:'شركة'},{value:'individual',label:'فرد'}]}/>
        </Field>}
        {addRoles.includes('investor')&&<Field label="طاقة التمويل">
          <Input type="number" value={addForm.funding_capacity} onChange={e=>setAddForm({...addForm,funding_capacity:e.target.value})} placeholder="0"/>
        </Field>}
        <Field label="الهاتف"><Input value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})} placeholder="اختياري"/></Field>
        <Field label="البريد الإلكتروني"><Input value={addForm.email} onChange={e=>setAddForm({...addForm,email:e.target.value})} placeholder="اختياري"/></Field>
        <Field label="العنوان"><Input value={addForm.address} onChange={e=>setAddForm({...addForm,address:e.target.value})} placeholder="اختياري"/></Field>
      </Modal>}

      {dupMatches && <PartyDuplicateModal
        matches={dupMatches} roleName={addRoles.map(r=>roleLabels[r]).join(' + ')}
        onAddRole={addRoleToExisting}
        onCreateNew={()=>{ setDupMatches(null); doCreate(); }}
        onCancel={()=>{ setDupMatches(null); setSaving(false); }}
      />}
    </div>
  );
}

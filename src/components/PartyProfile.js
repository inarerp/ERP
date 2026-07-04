function PartyProfile({ partyId, onBack, navigateSub }) {
  const [party,    setParty]    = useState(null);
  const [roles,    setRoles]    = useState([]);
  const [inv,      setInv]      = useState(null);
  const [entity,   setEntity]   = useState(null);
  const [broker,   setBroker]   = useState(null);
  const [client,   setClient]   = useState(null);
  const [invDeals, setInvDeals] = useState([]);
  const [entDeals, setEntDeals] = useState([]);
  const [brkDeals, setBrkDeals] = useState([]);
  const [cliDeals, setCliDeals] = useState([]);
  const [invLedger,setInvLedger]= useState([]);
  const [tlFilter, setTlFilter] = useState('all');
  const [sections, setSections] = useState({ roles:true, deals:true, timeline:true });
  const [loading,  setLoading]  = useState(true);

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editForm,  setEditForm]  = useState({});
  const [saving,    setSaving]    = useState(false);

  // Add Role modal
  const [addRoleModal, setAddRoleModal]  = useState(false);
  const [addRoleType,  setAddRoleType]   = useState('');
  const [addRoleExtra, setAddRoleExtra]  = useState({ funding_capacity:'' });
  const [addRoleSaving,setAddRoleSaving] = useState(false);

  const roleColors = { investor:'role-investor', entity:'role-entity', broker:'role-broker', client:'role-client', supplier:'role-other' };
  const roleLabels = { investor:'ممول', entity:'كيان', broker:'وسيط', client:'عميل', supplier:'مورد' };

  const load = useCallback(async () => {
    const { data: p } = await sb.from('parties').select('*').eq('id', partyId).single();
    if (!p) return;
    setParty(p);
    setEditForm({ name:p.name, phone:p.phone||'', email:p.email||'', address:p.address||'', notes:p.notes||'' });

    const { data: r } = await sb.from('party_roles').select('*').eq('party_id', partyId).order('created_at');
    const allRoles = r || [];
    setRoles(allRoles);
    const activeRoles = allRoles.filter(x => x.is_active);

    const invRole = activeRoles.find(x => x.role === 'investor');
    const entRole = activeRoles.find(x => x.role === 'entity');
    const brkRole = activeRoles.find(x => x.role === 'broker');
    const cliRole = activeRoles.find(x => x.role === 'client');

    await Promise.all([
      invRole && sb.from('investors').select('*').eq('id', invRole.source_record_id).single().then(({ data }) => {
        setInv(data);
        return Promise.all([
          sb.from('deal_investors').select('*, deals(id,deal_number,name,status,value)').eq('investor_id', invRole.source_record_id).then(({ data: d }) => setInvDeals(d||[])),
          sb.from('investor_ledger').select('*').eq('investor_id', invRole.source_record_id).order('created_at',{ascending:false}).limit(30).then(({ data: d }) => setInvLedger(d||[])),
        ]);
      }),
      entRole && sb.from('entities').select('*').eq('id', entRole.source_record_id).single().then(({ data }) => {
        setEntity(data);
        return sb.from('deals').select('id,deal_number,name,status,value,created_at').eq('entity_id', entRole.source_record_id).order('created_at',{ascending:false}).limit(20).then(({ data: d }) => setEntDeals(d||[]));
      }),
      brkRole && sb.from('brokers').select('*').eq('id', brkRole.source_record_id).single().then(({ data }) => {
        setBroker(data);
        return sb.from('deal_brokers').select('*, deals(id,deal_number,name,status,value)').eq('broker_id', brkRole.source_record_id).then(({ data: d }) => setBrkDeals(d||[]));
      }),
      cliRole && sb.from('clients').select('*').eq('id', cliRole.source_record_id).single().then(({ data }) => {
        setClient(data);
        return sb.from('deals').select('id,deal_number,name,status,value,created_at').eq('client_id', cliRole.source_record_id).order('created_at',{ascending:false}).limit(20).then(({ data: d }) => setCliDeals(d||[]));
      }),
    ].filter(Boolean));

    setLoading(false);
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  // ── Timeline موحدة ──
  const buildTimeline = () => {
    const items = [];
    invLedger.forEach(l => items.push({
      id:'il'+l.id, date:l.created_at, role:'investor',
      icon:'💰',
      title: { deposit:'إيداع', allocation:'تخصيص لعملية', capital_return:'إرجاع رأس مال', capital_withdrawal:'سحب' }[l.movement_type] || l.movement_type,
      sub: l.notes||'', amount: l.amount,
      dir: ['deposit','capital_return'].includes(l.movement_type) ? 'in' : 'out',
    }));
    invDeals.forEach(di => items.push({
      id:'di'+di.id, date: di.created_at, role:'investor',
      icon:'📋', title:`تخصيص: ${di.deals?.deal_number||''} — ${di.deals?.name||''}`,
      sub: (STATUS_MAP[di.deals?.status]||{label:di.deals?.status}).label, amount: di.amount, dir:'out',
    }));
    entDeals.forEach(d => items.push({
      id:'ed'+d.id, date: d.created_at, role:'entity',
      icon:'🏢', title:`عملية: ${d.deal_number} — ${d.name}`,
      sub: (STATUS_MAP[d.status]||{label:d.status}).label, amount: d.value, dir:'in',
    }));
    brkDeals.forEach(d => items.push({
      id:'bd'+d.id, date: d.created_at||d.deals?.created_at, role:'broker',
      icon:'🤝', title:`وساطة: ${d.deals?.deal_number||''} — ${d.deals?.name||''}`,
      sub: '', amount: d.commission_due, dir:'in',
    }));
    cliDeals.forEach(d => items.push({
      id:'cd'+d.id, date: d.created_at, role:'client',
      icon:'🛒', title:`توريد: ${d.deal_number} — ${d.name}`,
      sub: (STATUS_MAP[d.status]||{label:d.status}).label, amount: d.value, dir:'out',
    }));
    items.sort((a,b) => new Date(b.date) - new Date(a.date));
    return tlFilter==='all' ? items : items.filter(x => x.role===tlFilter);
  };

  // ── حفظ تعديل البيانات الأساسية ──
  const saveEdit = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      await sb.from('parties').update({
        name: editForm.name.trim(), phone: editForm.phone||null,
        email: editForm.email||null, address: editForm.address||null, notes: editForm.notes||null,
      }).eq('id', partyId);
      // مزامنة الاسم في الجداول الأصلية
      const activeRoles = roles.filter(x => x.is_active);
      await Promise.all(activeRoles.map(r => {
        if (r.role==='investor') return sb.from('investors').update({name:editForm.name.trim(),phone:editForm.phone||null,email:editForm.email||null}).eq('id',r.source_record_id);
        if (r.role==='entity')   return sb.from('entities').update({name:editForm.name.trim()}).eq('id',r.source_record_id);
        if (r.role==='broker')   return sb.from('brokers').update({name:editForm.name.trim(),phone:editForm.phone||null,email:editForm.email||null}).eq('id',r.source_record_id);
        if (r.role==='client')   return sb.from('clients').update({name:editForm.name.trim(),phone:editForm.phone||null,email:editForm.email||null}).eq('id',r.source_record_id);
        return Promise.resolve();
      }));
      setEditModal(false);
      await load();
    } catch(err) { showError(err, 'تعديل بيانات الطرف'); }
    finally { setSaving(false); }
  };

  // ── إضافة دور جديد ──
  const saveAddRole = async () => {
    if (!addRoleType) return;
    setAddRoleSaving(true);
    try {
      const name = party.name;
      if (addRoleType==='investor') await callRpc('create_investor_atomic', { p_name:name, p_phone:party.phone||null, p_email:party.email||null, p_funding_capacity:Number(addRoleExtra.funding_capacity)||0, p_notes:null });
      if (addRoleType==='entity')   await callRpc('create_entity_atomic',   { p_name:name, p_type:'company', p_notes:null });
      if (addRoleType==='broker')   await callRpc('create_broker_atomic',   { p_name:name, p_phone:party.phone||null, p_email:party.email||null, p_notes:null });
      if (addRoleType==='client')   await callRpc('create_client_atomic',   { p_name:name, p_contact_name:null, p_phone:party.phone||null, p_email:party.email||null, p_address:party.address||null, p_notes:null });
      setAddRoleModal(false); setAddRoleType(''); setAddRoleExtra({ funding_capacity:'' });
      await load();
    } catch(err) { showError(err, 'إضافة دور'); }
    finally { setAddRoleSaving(false); }
  };

  // ── تعطيل / تفعيل دور ──
  const toggleRole = async (roleId, currentActive) => {
    try {
      await sb.from('party_roles').update({ is_active: !currentActive }).eq('id', roleId);
      await load();
    } catch(err) { showError(err, 'تعديل الدور'); }
  };

  const toggleSection = k => setSections(s => ({...s, [k]:!s[k]}));

  if (loading) return <Loading/>;
  if (!party)  return <div style={{padding:24,color:'var(--red)'}}>الطرف غير موجود</div>;

  const activeRoles = roles.filter(r => r.is_active);
  const existingActiveRoles = activeRoles.map(r => r.role);
  const availableRoles = ['investor','entity','broker','client'].filter(r => !existingActiveRoles.includes(r));
  const tl = buildTimeline();
  const initials = (party.name||'؟').trim().slice(0,2);

  // ── إحصائيات سريعة للـ header ──
  const totalDeals = invDeals.length + entDeals.length + brkDeals.length + cliDeals.length;
  const lastActivity = [...invLedger.map(x=>x.created_at), ...entDeals.map(x=>x.created_at), ...cliDeals.map(x=>x.created_at)]
    .filter(Boolean).sort().reverse()[0];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <span className="breadcrumb-item" onClick={onBack}>الأطراف</span>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-item active">{party.name}</span>
      </div>

      {/* ── Party Header ── */}
      <div className="party-header">
        <div className="party-avatar">{initials}</div>
        <div style={{flex:1,minWidth:0}}>
          <div className="party-name">{party.name}</div>
          <div className="party-meta">
            {party.phone   && <span>📞 {party.phone}</span>}
            {party.email   && <span>✉️ {party.email}</span>}
            {party.address && <span>📍 {party.address}</span>}
            <span style={{color:'var(--text3)'}}>{party.type==='person'?'👤 شخص طبيعي':'🏢 شركة'}</span>
            {lastActivity && <span style={{color:'var(--text3)'}}>آخر نشاط: {new Date(lastActivity).toLocaleDateString('ar-EG')}</span>}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
            {activeRoles.map(r => (
              <span key={r.id} className={`role-pill ${roleColors[r.role]||'role-other'}`}>
                {roleLabels[r.role]||r.role}
              </span>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <button className="topbar-btn" style={{background:'var(--bg3)',color:'var(--text)'}} onClick={()=>setEditModal(true)}>
            <Icon d={Icons.edit}/> تعديل
          </button>
        </div>
      </div>

      {/* ── KPI Bar ── */}
      <div style={{display:'flex',gap:12,padding:'12px 20px',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
        <div className="kpi-card" style={{flex:1,minWidth:120}}>
          <div className="kpi-label">عمليات مرتبطة</div>
          <div className="kpi-value">{totalDeals}</div>
        </div>
        {inv && <>
          <div className="kpi-card" style={{flex:1,minWidth:120}}>
            <div className="kpi-label">رصيد متاح</div>
            <div className="kpi-value green">{fmtShort(inv.available_balance)}</div>
          </div>
          <div className="kpi-card" style={{flex:1,minWidth:120}}>
            <div className="kpi-label">رصيد عامل</div>
            <div className="kpi-value blue">{fmtShort(inv.working_balance)}</div>
          </div>
          <div className="kpi-card" style={{flex:1,minWidth:120}}>
            <div className="kpi-label">أرباح مستحقة</div>
            <div className="kpi-value amber">{fmtShort(Number(inv.profit_due||0)-Number(inv.profit_paid||0))}</div>
          </div>
        </>}
        {broker && <>
          <div className="kpi-card" style={{flex:1,minWidth:120}}>
            <div className="kpi-label">عمولات مستحقة</div>
            <div className="kpi-value amber">{fmtShort(Number(broker.commission_due||0)-Number(broker.commission_paid||0))}</div>
          </div>
        </>}
        {(entDeals.length>0||cliDeals.length>0) && <>
          <div className="kpi-card" style={{flex:1,minWidth:120}}>
            <div className="kpi-label">إجمالي قيمة العمليات</div>
            <div className="kpi-value">{fmtShort([...entDeals,...cliDeals].reduce((a,d)=>a+Number(d.value||0),0))}</div>
          </div>
        </>}
      </div>

      <div className="party-sections">

        {/* ── Section: إدارة الأدوار ── */}
        <div className="party-section">
          <div className="party-section-header" onClick={()=>toggleSection('roles')}>
            <div className="party-section-title"><Icon d={Icons.role}/> الأدوار</div>
            <span style={{fontSize:12,color:'var(--text3)'}}>{sections.roles?'▲':'▼'}</span>
          </div>
          {sections.roles && <div className="party-section-body">
            {/* الأدوار الحالية */}
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
              {roles.map(r => (
                <div key={r.id} style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'10px 14px',borderRadius:10,
                  background: r.is_active ? 'var(--bg3)' : 'rgba(100,116,139,.08)',
                  border:`1px solid ${r.is_active ? 'var(--border)' : 'rgba(100,116,139,.2)'}`,
                  opacity: r.is_active ? 1 : 0.65,
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span className={`role-pill ${r.is_active ? (roleColors[r.role]||'role-other') : 'role-other'}`}>
                      {roleLabels[r.role]||r.role}
                    </span>
                    <span style={{fontSize:12,color:'var(--text3)'}}>
                      {r.is_active ? '✅ نشط' : '⛔ معطل'}
                      {' · '}منذ {new Date(r.created_at).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                  <button
                    onClick={()=>toggleRole(r.id, r.is_active)}
                    style={{
                      padding:'4px 12px',borderRadius:6,border:'1px solid var(--border)',
                      background:'none',color:r.is_active?'var(--red)':'var(--green)',
                      cursor:'pointer',fontSize:12,fontFamily:'Cairo,sans-serif',
                    }}>
                    {r.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              ))}
            </div>
            {/* إضافة دور جديد */}
            {availableRoles.length > 0 && (
              <button
                onClick={()=>{ setAddRoleModal(true); setAddRoleType(availableRoles[0]); }}
                className="topbar-btn btn-primary"
                style={{fontSize:12}}>
                <Icon d={Icons.plus}/> إضافة دور جديد
              </button>
            )}
            {availableRoles.length === 0 && (
              <div style={{fontSize:12,color:'var(--text3)',padding:'8px 0'}}>✅ هذا الطرف لديه جميع الأدوار المتاحة</div>
            )}
          </div>}
        </div>

        {/* ── Section: العمليات المرتبطة ── */}
        {(invDeals.length>0||entDeals.length>0||brkDeals.length>0||cliDeals.length>0) && (
          <div className="party-section">
            <div className="party-section-header" onClick={()=>toggleSection('deals')}>
              <div className="party-section-title"><Icon d={Icons.deals}/> العمليات المرتبطة</div>
              <span style={{fontSize:12,color:'var(--text3)'}}>{totalDeals} عملية {sections.deals?'▲':'▼'}</span>
            </div>
            {sections.deals && <div className="party-section-body">
              {inv && invDeals.length>0 && <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>كـ ممول</div>
                {invDeals.map(di=>(
                  <div key={di.id} className="action-item" onClick={()=>di.deals&&navigateSub&&navigateSub('deals',di.deals.id)}>
                    <span style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="priority-dot" style={{background:'var(--accent)'}}/>
                      <span style={{fontWeight:600}}>{di.deals?.deal_number}</span>
                      <span style={{color:'var(--text2)',fontSize:12}}>{di.deals?.name}</span>
                    </span>
                    <span style={{color:'var(--green)',fontWeight:600}}>{fmt(di.amount)}</span>
                  </div>
                ))}
              </div>}
              {entity && entDeals.length>0 && <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>كـ كيان منفذ</div>
                {entDeals.map(d=>(
                  <div key={d.id} className="action-item" onClick={()=>navigateSub&&navigateSub('deals',d.id)}>
                    <span style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="priority-dot" style={{background:'rgba(139,92,246,.7)'}}/>
                      <span style={{fontWeight:600}}>{d.deal_number}</span>
                      <span style={{color:'var(--text2)',fontSize:12}}>{d.name}</span>
                    </span>
                    <span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:d.status}).label}</span>
                  </div>
                ))}
              </div>}
              {broker && brkDeals.length>0 && <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>كـ وسيط</div>
                {brkDeals.map(d=>(
                  <div key={d.id} className="action-item" onClick={()=>d.deals&&navigateSub&&navigateSub('deals',d.deals.id)}>
                    <span style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="priority-dot" style={{background:'var(--amber)'}}/>
                      <span style={{fontWeight:600}}>{d.deals?.deal_number}</span>
                      <span style={{color:'var(--text2)',fontSize:12}}>{d.deals?.name}</span>
                    </span>
                    <span style={{color:'var(--amber)',fontWeight:600,fontSize:12}}>{fmt(d.commission_due)}</span>
                  </div>
                ))}
              </div>}
              {client && cliDeals.length>0 && <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>كـ عميل</div>
                {cliDeals.map(d=>(
                  <div key={d.id} className="action-item" onClick={()=>navigateSub&&navigateSub('deals',d.id)}>
                    <span style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="priority-dot" style={{background:'var(--green)'}}/>
                      <span style={{fontWeight:600}}>{d.deal_number}</span>
                      <span style={{color:'var(--text2)',fontSize:12}}>{d.name}</span>
                    </span>
                    <span style={{color:'var(--green)',fontWeight:600,fontSize:12}}>{fmt(d.value)}</span>
                  </div>
                ))}
              </div>}
            </div>}
          </div>
        )}

        {/* ── Section: Timeline ── */}
        <div className="party-section">
          <div className="party-section-header" onClick={()=>toggleSection('timeline')}>
            <div className="party-section-title"><Icon d={Icons.clock}/> السجل الكامل</div>
            <span style={{fontSize:12,color:'var(--text3)'}}>{tl.length} حدث {sections.timeline?'▲':'▼'}</span>
          </div>
          {sections.timeline && <>
            <div className="timeline-filters">
              {['all','investor','entity','broker','client'].map(f=>(
                <button key={f} className={`tl-filter ${tlFilter===f?'active':''}`} onClick={()=>setTlFilter(f)}>
                  {{all:'الكل',investor:'كـ ممول',entity:'كـ كيان',broker:'كـ وسيط',client:'كـ عميل'}[f]}
                </button>
              ))}
            </div>
            {tl.length===0
              ? <Empty icon="📋" title="لا سجلات بعد"/>
              : <div className="timeline">
                  {tl.map(item=>(
                    <div key={item.id} className="timeline-item">
                      <div className="timeline-line"/>
                      <div className="timeline-dot" style={{
                        background:{investor:'rgba(61,127,255,.15)',entity:'rgba(139,92,246,.15)',broker:'rgba(245,158,11,.15)',client:'rgba(16,185,129,.15)'}[item.role]||'var(--bg3)',
                      }}>{item.icon}</div>
                      <div className="timeline-content">
                        <div className="timeline-title">{item.title}</div>
                        <div className="timeline-sub">{item.sub} · {item.date?new Date(item.date).toLocaleDateString('ar-EG'):''}</div>
                        {item.amount>0 && <div style={{fontSize:12,fontWeight:600,color:item.dir==='in'?'var(--green)':'var(--amber)',marginTop:2}}>
                          {item.dir==='in'?'+':'-'}{fmt(item.amount)}
                        </div>}
                      </div>
                    </div>
                  ))}
                </div>}
          </>}
        </div>

      </div>

      {/* ── Edit Party Modal ── */}
      {editModal && <Modal title="تعديل بيانات الطرف" onClose={()=>setEditModal(false)} onSave={saveEdit} saving={saving}>
        <Field label="الاسم" required>
          <Input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})}/>
        </Field>
        <Field label="الهاتف">
          <Input value={editForm.phone} onChange={e=>setEditForm({...editForm,phone:e.target.value})} placeholder="اختياري"/>
        </Field>
        <Field label="البريد الإلكتروني">
          <Input value={editForm.email} onChange={e=>setEditForm({...editForm,email:e.target.value})} placeholder="اختياري"/>
        </Field>
        <Field label="العنوان">
          <Input value={editForm.address} onChange={e=>setEditForm({...editForm,address:e.target.value})} placeholder="اختياري"/>
        </Field>
        <Field label="ملاحظات" hint="تُحدَّث بيانات الاتصال في جميع الأدوار تلقائياً">
          <textarea className="form-input" rows={3} value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})} style={{resize:'vertical'}}/>
        </Field>
      </Modal>}

      {/* ── Add Role Modal ── */}
      {addRoleModal && <Modal title="إضافة دور جديد" onClose={()=>{setAddRoleModal(false);setAddRoleType('');}} onSave={saveAddRole} saving={addRoleSaving} saveLabel="إضافة">
        <div style={{background:'var(--bg3)',borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13}}>
          <div style={{fontWeight:600,marginBottom:4}}>{party.name}</div>
          {party.phone && <div style={{color:'var(--text2)',fontSize:12}}>📞 {party.phone}</div>}
          {party.email && <div style={{color:'var(--text2)',fontSize:12}}>✉️ {party.email}</div>}
          <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>بيانات الطرف ستُستخدم تلقائياً — لا حاجة لإعادة إدخالها</div>
        </div>
        <Field label="الدور الجديد" required>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {availableRoles.map(r=>(
              <button key={r} type="button"
                onClick={()=>setAddRoleType(r)}
                style={{padding:'8px 16px',borderRadius:20,border:'1px solid',fontSize:13,cursor:'pointer',
                  fontFamily:'Cairo,sans-serif',transition:'all .15s',
                  background: addRoleType===r ? 'var(--accent)' : 'var(--bg3)',
                  borderColor: addRoleType===r ? 'var(--accent)' : 'var(--border)',
                  color: addRoleType===r ? 'white' : 'var(--text2)',
                }}>
                {addRoleType===r?'✓ ':''}{roleLabels[r]}
              </button>
            ))}
          </div>
        </Field>
        {addRoleType==='investor' && (
          <Field label="طاقة التمويل (اختياري)">
            <Input type="number" value={addRoleExtra.funding_capacity} onChange={e=>setAddRoleExtra({...addRoleExtra,funding_capacity:e.target.value})} placeholder="0"/>
          </Field>
        )}
      </Modal>}

    </div>
  );
}

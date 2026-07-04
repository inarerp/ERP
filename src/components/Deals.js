function Deals({ navigateSub, navigateBack, subId }) {
  const [data, setData] = useState([]);
  const [entities, setEntities] = useState([]);
  const [clients, setClients] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const selectedDeal = subId || null;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const emptyForm = { deal_number:'', name:'', entity_id:'', client_id:'', deal_type:'supply', value:'', cost:'', supply_price:'', status:'studying', tax_applicable:false, tax_expected:'', investor_ids:[], broker_id:'', notes:'' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: d }, entParties, cliParties, invParties, brkParties] = await Promise.all([
      sb.from('deals').select('*, entities(name), clients(name)').order('created_at',{ascending:false}).limit(500),
      fetchPartiesByRole('entity'),
      fetchPartiesByRole('client'),
      fetchInvestorParties(),
      fetchPartiesByRole('broker'),
    ]);
    setData(d||[]);
    setEntities(entParties);
    setClients(cliParties);
    setInvestors(invParties);
    setBrokers(brkParties);
    setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const validate = () => {
    const e = {};
    if (!form.deal_number.trim()) e.deal_number = true;
    if (!form.name.trim()) e.name = true;
    if (!form.entity_id) e.entity_id = true;
    if (!form.value) e.value = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const toggleInvestor = (id) => {
    setForm(f => ({
      ...f,
      investor_ids: f.investor_ids.includes(id)
        ? f.investor_ids.filter(x=>x!==id)
        : [...f.investor_ids, id]
    }));
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const expected = form.value && form.cost ? Number(form.value)-Number(form.cost) : 0;
    const { data: inserted, error } = await sb.from('deals').insert([{
      deal_number: form.deal_number.trim(), name: form.name.trim(),
      entity_id: form.entity_id||null, client_id: form.client_id||null,
      deal_type: form.deal_type, value: Number(form.value)||0,
      cost: Number(form.cost)||0, supply_price: Number(form.supply_price)||0,
      expected_profit: expected, status: form.status,
      tax_applicable: form.tax_applicable,
      tax_expected: form.tax_applicable ? Number(form.tax_expected)||0 : 0,
      notes: form.notes,
    }]).select().single();

    if (!error && inserted) {
      // H-02 FIX: deal_investors insert with amount:0 removed.
      // Inserting with amount=0 bypasses allocate_investor_to_deal_atomic,
      // leaves funding_provided unchanged, and creates phantom deal_investor rows
      // with no financial record. Capital allocation is done from DealDetail
      // via allocate_investor_to_deal_atomic after the deal is created.
      // investor_ids selection in this form is UI-only (for future reference display).

      // ربط الوسيط فقط — لا تأثير مالي
      if (form.broker_id) {
        await sb.from('deal_brokers').insert([{ deal_id: inserted.id, broker_id: form.broker_id, commission_type: 'fixed_amount', commission_value: 0 }]);
      }
    }
    setModal(false); setForm(emptyForm); setErrors({});
    await load(); setSaving(false);
  };

  const inputStyle = (field) => ({ ...(errors[field] ? { borderColor:'var(--red)' } : {}) });
  const errMsg = (field) => errors[field] ? <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>هذا الحقل مطلوب</div> : null;

  if (selectedDeal) return <DealDetail dealId={selectedDeal} onBack={()=>{ navigateBack('deals'); load(); }}/>;

  // P5: search + pagination
  const searchLower = search.toLowerCase();
  const filtered = data.filter(d =>
    !search ||
    (d.deal_number||'').toLowerCase().includes(searchLower) ||
    (d.name||'').toLowerCase().includes(searchLower) ||
    (d.entities?.name||'').toLowerCase().includes(searchLower)
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="content">
      <div className="section">
        <div className="section-header">
          <span className="section-title">العمليات ({filtered.length})</span>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {/* P5: search box */}
            <input
              className="form-input" style={{width:200,fontSize:13}}
              placeholder="بحث باسم أو رقم العملية..."
              value={search}
              onChange={e=>{ setSearch(e.target.value); setPage(0); }}
            />
            <button className="topbar-btn btn-primary" onClick={()=>{ setForm(emptyForm); setErrors({}); setModal(true); }}>
              <Icon d={Icons.plus}/> عملية جديدة
            </button>
          </div>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : filtered.length === 0
          ? <Empty icon="📋" title="لا توجد عمليات" sub={search ? 'لا توجد نتائج للبحث' : 'ابدأ بإضافة أول عملية'}/>
          : <>
          <table className="table">
              <thead><tr><th>الرقم</th><th>الاسم</th><th>الكيان</th><th>النوع</th><th>قيمة التوريد</th><th>الربح المتوقع</th><th>الحالة</th></tr></thead>
              <tbody>{paginated.map(d=>(
                <tr key={d.id} onClick={()=>navigateSub('deals',d.id)} style={{cursor:'pointer'}}>
                  <td style={{color:'var(--text2)',fontFamily:'monospace',fontSize:12}}>{d.deal_number}</td>
                  <td style={{fontWeight:600,color:'var(--accent)'}}>{d.name}</td>
                  <td>{d.entities?.name||'—'}</td>
                  <td><span className={`badge ${d.deal_type==='supply'?'badge-blue':'badge-purple'}`}>{d.deal_type==='supply'?'توريد':'تمويل'}</span></td>
                  <td style={{color:'var(--text)'}}>{fmt(d.supply_price||d.value)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(d.expected_profit)}</td>
                  <td>
                    <span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:d.status}).label}</span>
                    {d.tax_applicable && <span className="badge badge-amber" style={{marginRight:4}}>ضريبي</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {/* P5: Pagination controls */}
            {totalPages > 1 && (
              <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,padding:'12px 0',flexWrap:'wrap'}}>
                <button className="topbar-btn btn-ghost" style={{padding:'4px 12px'}}
                  onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>←</button>
                {Array.from({length:totalPages},(_,i)=>(
                  <button key={i} onClick={()=>setPage(i)} className="topbar-btn"
                    style={{padding:'4px 10px',
                      background: i===page ? 'var(--accent)' : 'var(--bg3)',
                      color: i===page ? '#fff' : 'var(--text2)',
                      border:'1px solid var(--border)'}}>
                    {i+1}
                  </button>
                ))}
                <button className="topbar-btn btn-ghost" style={{padding:'4px 12px'}}
                  onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}>→</button>
                <span style={{fontSize:12,color:'var(--text3)'}}>{filtered.length} عملية</span>
              </div>
            )}
          </>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal" style={{maxWidth:600}}>
          <div className="modal-header">
            <span className="modal-title">إضافة عملية جديدة</span>
            <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
          </div>
          <div className="modal-body" style={{maxHeight:'70vh',overflowY:'auto'}}>

            {/* الرقم والنوع */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">رقم العملية <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" style={inputStyle('deal_number')} value={form.deal_number} onChange={e=>{setForm({...form,deal_number:e.target.value});setErrors({...errors,deal_number:false});}} placeholder="D-001"/>
                {errMsg('deal_number')}
              </div>
              <div className="form-group">
                <label className="form-label">نوع العملية</label>
                <select className="form-select" value={form.deal_type} onChange={e=>setForm({...form,deal_type:e.target.value})}>
                  <option value="supply">توريد</option>
                  <option value="finance">تمويل</option>
                </select>
              </div>
            </div>

            {/* الاسم */}
            <div className="form-group">
              <label className="form-label">اسم العملية <span style={{color:'var(--red)'}}>*</span></label>
              <input className="form-input" style={inputStyle('name')} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setErrors({...errors,name:false});}} placeholder="مثال: توريد أجهزة ريتش بيك"/>
              {errMsg('name')}
            </div>

            {/* الكيان والعميل */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">الكيان <span style={{color:'var(--red)'}}>*</span></label>
                <select className="form-select" style={inputStyle('entity_id')} value={form.entity_id} onChange={e=>{setForm({...form,entity_id:e.target.value});setErrors({...errors,entity_id:false});}}>
                  <option value="">اختر الكيان</option>
                  {(entities||[]).map(e=><option key={e.role_record_id||e.id} value={e.role_record_id||e.id}>{e.name}</option>)}
                </select>
                {errMsg('entity_id')}
              </div>
              <div className="form-group">
                <label className="form-label">العميل</label>
                <select className="form-select" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
                  <option value="">اختر العميل (اختياري)</option>
                  {clients.map(c=><option key={c.role_record_id||c.id} value={c.role_record_id||c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* الأسعار */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">سعر التوريد <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" style={inputStyle('value')} type="number" value={form.value} onChange={e=>{setForm({...form,value:e.target.value});setErrors({...errors,value:false});}} placeholder="0"/>
                {errMsg('value')}
              </div>
              <div className="form-group">
                <label className="form-label">تكلفة التنفيذ</label>
                <input className="form-input" type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} placeholder="0"/>
              </div>
              <div className="form-group">
                <label className="form-label">سعر الشراء</label>
                <input className="form-input" type="number" value={form.supply_price} onChange={e=>setForm({...form,supply_price:e.target.value})} placeholder="0"/>
              </div>
            </div>

            {/* ملخص الربح */}
            {form.value && form.cost && <div style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--green)',marginBottom:12,display:'flex',justifyContent:'space-between'}}>
              <span>الربح المتوقع</span>
              <strong>{fmt(Number(form.value)-Number(form.cost))}</strong>
            </div>}

            {/* الضريبة */}
            <div style={{background:'var(--bg3)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:14,fontWeight:500}}>
                <input type="checkbox" checked={form.tax_applicable} onChange={e=>setForm({...form,tax_applicable:e.target.checked})} style={{width:16,height:16,cursor:'pointer'}}/>
                العملية خاضعة للضريبة
              </label>
              {form.tax_applicable && <div style={{marginTop:10}}>
                <label className="form-label">قيمة الضريبة المتوقعة (ج.م)</label>
                <input className="form-input" type="number" value={form.tax_expected} onChange={e=>setForm({...form,tax_expected:e.target.value})} placeholder="0"/>
              </div>}
            </div>

            {/* الممولون */}
            {investors.length > 0 && <div style={{marginBottom:12}}>
              <label className="form-label">الممولون المتوقعون (للإشارة فقط — التخصيص المالي يتم من صفحة تفاصيل العملية)</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:6}}>
                {(investors||[]).map(inv=>(
                  <button key={inv.role_record_id||inv.id} type="button"
                    onClick={()=>toggleInvestor(inv.role_record_id||inv.id)}
                    style={{padding:'6px 14px',borderRadius:20,border:'1px solid',fontSize:13,cursor:'pointer',fontFamily:'Cairo,sans-serif',
                      background: form.investor_ids.includes(inv.role_record_id||inv.id) ? 'rgba(61,127,255,.15)' : 'var(--bg3)',
                      borderColor: form.investor_ids.includes(inv.role_record_id||inv.id) ? 'var(--accent)' : 'var(--border)',
                      color: form.investor_ids.includes(inv.role_record_id||inv.id) ? 'var(--accent)' : 'var(--text2)',
                    }}>
                    {form.investor_ids.includes(inv.role_record_id||inv.id) ? '✓ ' : ''}{inv.name}
                  </button>
                ))}
              </div>
            </div>}

            {/* الوسيط */}
            <div className="form-group">
              <label className="form-label">الوسيط (اختياري)</label>
              <select className="form-select" value={form.broker_id} onChange={e=>setForm({...form,broker_id:e.target.value})}>
                <option value="">بدون وسيط</option>
                {brokers.map(b=><option key={b.role_record_id||b.id} value={b.role_record_id||b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* الحالة والملاحظات */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">الحالة</label>
                <select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">ملاحظات</label>
                <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="اختياري"/>
              </div>
            </div>

          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={save} disabled={saving}>{saving?'جاري الحفظ...':'حفظ العملية'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

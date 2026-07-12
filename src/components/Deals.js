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
  const emptyForm = {
    deal_number:'', name:'', entity_id:'', client_id:'', deal_type:'supply', value:'',
    cost:'', supply_price:'', taxable_cost:'',
    tax_applicable:false, vat_amount:'', withholding_amount:'', income_tax_amount:'',
    funding_required:'', due_date:'', expected_collection_date:'', expected_end_date:'',
    broker_id:'', notes:'',
  };
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
    // العميل إجباري لعمليات التوريد (لازم يستلم التوريد)، اختياري لعمليات التمويل
    if (form.deal_type === 'supply' && !form.client_id) e.client_id = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (saving) return;
    setSaving(true);
    try {
      const isSupply = form.deal_type === 'supply';
      const cost = isSupply ? Number(form.cost)||0 : 0;
      const expected = form.value && cost ? Number(form.value)-cost : 0;
      const vat   = isSupply && form.tax_applicable ? Number(form.vat_amount)||0 : 0;
      const wh    = isSupply && form.tax_applicable ? Number(form.withholding_amount)||0 : 0;
      const inc   = isSupply && form.tax_applicable ? Number(form.income_tax_amount)||0 : 0;

      const { data: inserted, error } = await sb.from('deals').insert([{
        deal_number: form.deal_number.trim(), name: form.name.trim(),
        entity_id: form.entity_id||null, client_id: form.client_id||null,
        deal_type: form.deal_type, value: Number(form.value)||0,
        // العملية الجديدة تبدأ دائمًا بحالة "تحت الدراسة" — أي حالة أخرى
        // (نشطة/مغلقة/ملغاة...) تمر إلزاميًا عبر الـ RPCs المخصصة لاحقًا
        status: 'studying',
        // حقول التوريد/التكلفة/الضرائب غير منطقية لعمليات التمويل — تُرسَل صفر
        cost, supply_price: isSupply ? Number(form.supply_price)||0 : 0,
        taxable_cost: isSupply ? Number(form.taxable_cost)||0 : 0,
        expected_profit: expected,
        tax_applicable: isSupply ? form.tax_applicable : false,
        vat_amount: vat, withholding_amount: wh, income_tax_amount: inc,
        tax_expected: vat + wh + inc, // مجموع تلقائي للتوافق الخلفي
        funding_required: Number(form.funding_required)||0,
        due_date: form.due_date||null,
        expected_collection_date: form.expected_collection_date||null,
        expected_end_date: form.expected_end_date||null,
        notes: form.notes,
      }]).select().single();

      if (error) throw error;

      // ربط الوسيط فقط — لا تأثير مالي، تخصيص رأس المال الفعلي يتم من DealDetail
      if (form.broker_id && inserted) {
        await sb.from('deal_brokers').insert([{ deal_id: inserted.id, broker_id: form.broker_id, commission_type: 'fixed_amount', commission_value: 0 }]);
      }

      setModal(false); setForm(emptyForm); setErrors({});
      await load();
    } catch(err) {
      showError(err, 'إضافة عملية');
    } finally {
      setSaving(false);
    }
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
                <label className="form-label">العميل{form.deal_type==='supply' && <span style={{color:'var(--red)'}}> *</span>}</label>
                <select className="form-select" style={inputStyle('client_id')} value={form.client_id} onChange={e=>{setForm({...form,client_id:e.target.value});setErrors({...errors,client_id:false});}}>
                  <option value="">{form.deal_type==='supply' ? 'اختر العميل' : 'اختر العميل (اختياري)'}</option>
                  {clients.map(c=><option key={c.role_record_id||c.id} value={c.role_record_id||c.id}>{c.name}</option>)}
                </select>
                {errMsg('client_id')}
              </div>
            </div>

            {/* الأسعار — تظهر فقط لعمليات التوريد */}
            {form.deal_type==='supply' && <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">سعر التوريد <span style={{color:'var(--red)'}}>*</span></label>
                  <input className="form-input" style={inputStyle('value')} type="number" value={form.value} onChange={e=>{setForm({...form,value:e.target.value});setErrors({...errors,value:false});}} placeholder="0"/>
                  {errMsg('value')}
                </div>
                <div className="form-group">
                  <label className="form-label">التكلفة الفعلية للشراء</label>
                  <input className="form-input" type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} placeholder="0"/>
                  <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>المبلغ الحقيقي المدفوع — يُحسب منه الربح الفعلي</div>
                </div>
                <div className="form-group">
                  <label className="form-label">قيمة الفاتورة الضريبية</label>
                  <input className="form-input" type="number" value={form.taxable_cost} onChange={e=>setForm({...form,taxable_cost:e.target.value})} placeholder="0"/>
                  <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>مرجع ضريبي فقط — لا يؤثر على الربح الفعلي</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">سعر الشراء</label>
                <input className="form-input" type="number" value={form.supply_price} onChange={e=>setForm({...form,supply_price:e.target.value})} placeholder="0"/>
              </div>
            </>}

            {/* عملية التمويل: سعر التوريد فقط بدون حقول شراء/ضرائب */}
            {form.deal_type==='finance' && (
              <div className="form-group">
                <label className="form-label">قيمة التمويل <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" style={inputStyle('value')} type="number" value={form.value} onChange={e=>{setForm({...form,value:e.target.value});setErrors({...errors,value:false});}} placeholder="0"/>
                {errMsg('value')}
              </div>
            )}

            {/* ملخص الربح — للتوريد فقط */}
            {form.deal_type==='supply' && form.value && form.cost && <div style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--green)',marginBottom:12,display:'flex',justifyContent:'space-between'}}>
              <span>الربح المتوقع</span>
              <strong>{fmt(Number(form.value)-Number(form.cost))}</strong>
            </div>}

            {/* التمويل المطلوب */}
            <div className="form-group">
              <label className="form-label">التمويل المطلوب من الممولين</label>
              <input className="form-input" type="number" value={form.funding_required} onChange={e=>setForm({...form,funding_required:e.target.value})} placeholder="0"/>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>قد يقل عن قيمة العملية لو فيه تمويل ذاتي أو دفعة مقدَّمة من العميل — يُحدَّد يدويًا دائمًا</div>
            </div>

            {/* التواريخ المتوقعة */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">تاريخ الاستحقاق</label>
                <input className="form-input" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">التحصيل المتوقع</label>
                <input className="form-input" type="date" value={form.expected_collection_date} onChange={e=>setForm({...form,expected_collection_date:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">الانتهاء المتوقع</label>
                <input className="form-input" type="date" value={form.expected_end_date} onChange={e=>setForm({...form,expected_end_date:e.target.value})}/>
              </div>
            </div>

            {/* الضريبة — 3 أنواع منفصلة، لعمليات التوريد فقط */}
            {form.deal_type==='supply' && <div style={{background:'var(--bg3)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:14,fontWeight:500,marginBottom:10}}>
                <input type="checkbox" checked={form.tax_applicable} onChange={e=>setForm({...form,tax_applicable:e.target.checked})} style={{width:16,height:16,cursor:'pointer'}}/>
                العملية خاضعة للضريبة
              </label>
              {form.tax_applicable && <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:8}}>
                  <div className="form-group">
                    <label className="form-label">ضريبة القيمة المضافة (VAT)</label>
                    <input className="form-input" type="number" value={form.vat_amount} onChange={e=>setForm({...form,vat_amount:e.target.value})} placeholder="0"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">خصم تحت حساب الضريبة</label>
                    <input className="form-input" type="number" value={form.withholding_amount} onChange={e=>setForm({...form,withholding_amount:e.target.value})} placeholder="0"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ضريبة الدخل</label>
                    <input className="form-input" type="number" value={form.income_tax_amount} onChange={e=>setForm({...form,income_tax_amount:e.target.value})} placeholder="0"/>
                  </div>
                </div>
                <div style={{fontSize:11,color:'var(--text2)'}}>
                  إجمالي الضرائب المتوقعة: <strong>{fmt((Number(form.vat_amount)||0)+(Number(form.withholding_amount)||0)+(Number(form.income_tax_amount)||0))}</strong>
                </div>
              </>}
            </div>}

            {/* الوسيط */}
            <div className="form-group">
              <label className="form-label">الوسيط (اختياري)</label>
              <select className="form-select" value={form.broker_id} onChange={e=>setForm({...form,broker_id:e.target.value})}>
                <option value="">بدون وسيط</option>
                {brokers.map(b=><option key={b.role_record_id||b.id} value={b.role_record_id||b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* ملاحظات */}
            <div className="form-group">
              <label className="form-label">ملاحظات</label>
              <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="اختياري"/>
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

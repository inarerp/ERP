function FinancialMovements() {
  const [movements, setMovements] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [entities, setEntities] = useState([]);
  const [deals, setDeals] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ direction:'all', movement_type:'all', account_id:'all' });

  const emptyForm = {
    direction:'out', amount:'', movement_date: new Date().toISOString().slice(0,10),
    account_id:'', movement_type:'expense', category:'',
    entity_id:'', deal_id:'', investor_id:'', broker_id:'',
    is_deal_expense: false, description:'', notes:''
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    const [{ data: mv },{ data: acc },entParties,{ data: d },invParties,brkParties,{ data: cat }] = await Promise.all([
      sb.from('financial_movements').select('*, accounts(name), entities(name), deals(deal_number,name), investors(name), brokers(name)').order('movement_date', { ascending: false }).limit(500),
      sb.from('accounts').select('id,name,account_type,balance'),
      fetchPartiesByRole('entity'),
      sb.from('deals').select('id,deal_number,name').order('created_at',{ascending:false}).limit(500),
      fetchPartiesByRole('investor'),
      fetchPartiesByRole('broker'),
      sb.from('movement_categories').select('*').order('type').limit(200),
    ]);
    setMovements(mv||[]); setAccounts(acc||[]); setEntities(entParties);
    setDeals(d||[]); setInvestors(invParties); setBrokers(brkParties);
    setCategories(cat||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const validate = () => {
    const e = {};
    if (!form.amount) e.amount = true;
    if (!form.account_id) e.account_id = true;
    if (!form.movement_date) e.movement_date = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (saving) return;
    try {
      const amt = assertPositiveAmount(form.amount, 'المبلغ');
      setSaving(true);
      await callRpc('record_financial_movement_atomic', {
        p_direction:        form.direction,
        p_amount:           amt,
        p_movement_date:    form.movement_date || todayStr(),
        p_account_id:       form.account_id   || null,
        p_movement_type:    form.movement_type,
        p_category:         form.category     || null,
        p_entity_id:        form.entity_id    || null,
        p_deal_id:          form.deal_id      || null,
        p_investor_id:      form.investor_id  || null,
        p_broker_id:        form.broker_id    || null,
        p_is_deal_expense:  form.is_deal_expense || false,
        p_description:      form.description  || null,
        p_notes:            form.notes        || null,
        p_idempotency_key:  makeIdempotencyKey('fm'),
      });
      setModal(false); setForm(emptyForm); setErrors({});
      await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  // فلترة
  const filtered = movements.filter(m => {
    if (filter.direction!=='all' && m.direction!==filter.direction) return false;
    if (filter.movement_type!=='all' && m.movement_type!==filter.movement_type) return false;
    if (filter.account_id!=='all' && m.account_id!==filter.account_id) return false;
    return true;
  });

  const totalIn  = filtered.filter(m=>m.direction==='in').reduce((a,m)=>a+Number(m.amount),0);
  const totalOut = filtered.filter(m=>m.direction==='out').reduce((a,m)=>a+Number(m.amount),0);

  const mvTypes = {
    expense:'مصروف', revenue:'إيراد', transfer:'تحويل',
    investor_deposit:'إيداع ممول', investor_return:'إرجاع ممول',
    broker_payment:'دفع وسيط', owner_withdrawal:'سحب مالك'
  };
  const mvTypeColors = {
    expense:'badge-red', revenue:'badge-green', transfer:'badge-blue',
    investor_deposit:'badge-purple', investor_return:'badge-amber',
    broker_payment:'badge-amber', owner_withdrawal:'badge-gray'
  };
  const expCats = categories.filter(c=>c.type==='expense');
  const revCats = categories.filter(c=>c.type==='revenue');
  const currentCats = ['expense','investor_return','broker_payment','owner_withdrawal'].includes(form.movement_type) ? expCats : revCats;

  return (
    <div className="content">
      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:20}}>
        {(accounts||[]).map(a=>(
          <div key={a.id} className="stat-card">
            <div className="stat-label">{a.name}</div>
            <div className={`stat-value ${Number(a.balance)>=0?'green':'red'}`}>{fmtShort(a.balance)}</div>
            <div className="stat-sub">{{cash:'كاش',bank:'بنك',mobile_wallet:'محفظة'}[a.account_type]||a.account_type}</div>
          </div>
        ))}
        <StatCard label="إجمالي الوارد (المعروض)" valueClass="green" value={fmtShort(totalIn)}/>
        <StatCard label="إجمالي الصادر (المعروض)" valueClass="red" value={fmtShort(totalOut)}/>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">الحركات المالية</span>
          <button className="topbar-btn btn-primary" onClick={()=>{ setForm(emptyForm); setErrors({}); setModal(true); }}>
            <Icon d={Icons.plus}/> حركة جديدة
          </button>
        </div>

        {/* فلاتر */}
        <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap'}}>
          <select className="form-select" style={{width:'auto',minWidth:130}} value={filter.direction} onChange={e=>setFilter({...filter,direction:e.target.value})}>
            <option value="all">كل الاتجاهات</option>
            <option value="in">وارد فقط</option>
            <option value="out">صادر فقط</option>
          </select>
          <select className="form-select" style={{width:'auto',minWidth:150}} value={filter.movement_type} onChange={e=>setFilter({...filter,movement_type:e.target.value})}>
            <option value="all">كل الأنواع</option>
            {Object.entries(mvTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select className="form-select" style={{width:'auto',minWidth:150}} value={filter.account_id} onChange={e=>setFilter({...filter,account_id:e.target.value})}>
            <option value="all">كل الحسابات</option>
            {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="section-body">
          {loading ? <Loading/>
          : filtered.length===0
          ? <Empty icon="💳" title="لا توجد حركات"/>
          : <table className="table">
              <thead><tr>
                <th>التاريخ</th><th>الاتجاه</th><th>النوع</th><th>الفئة</th>
                <th>المبلغ</th><th>الحساب</th><th>مرتبط بـ</th><th>البيان</th><th></th>
              </tr></thead>
              <tbody>{filtered.map(m=>(
                <tr key={m.id}>
                  <td style={{color:'var(--text2)',fontSize:12}}>{m.movement_date}</td>
                  <td>
                    <span className={`badge ${m.direction==='in'?'badge-green':'badge-red'}`}>
                      {m.direction==='in'?'▲ وارد':'▼ صادر'}
                    </span>
                  </td>
                  <td><span className={`badge ${mvTypeColors[m.movement_type]||'badge-gray'}`}>{mvTypes[m.movement_type]||m.movement_type}</span></td>
                  <td style={{color:'var(--text2)',fontSize:12}}>{m.category||'—'}</td>
                  <td style={{fontWeight:700,color:m.direction==='in'?'var(--green)':'var(--red)'}}>{fmt(m.amount)}</td>
                  <td style={{fontSize:12}}>{m.accounts?.name||'—'}</td>
                  <td style={{fontSize:12,color:'var(--text2)'}}>
                    {m.deals?.deal_number ? `📋 ${m.deals.deal_number}` :
                     m.investors?.name ? `👤 ${m.investors.name}` :
                     m.entities?.name ? `🏢 ${m.entities.name}` :
                     m.brokers?.name ? `🤝 ${m.brokers.name}` : '—'}
                  </td>
                  <td style={{color:'var(--text2)',fontSize:12,maxWidth:180}}>{m.description||'—'}</td>
                  <td>
                    {!m.is_reversed && !m.is_reversal &&
                      <button onClick={async()=>{
                        const r = prompt('سبب التصحيح؟');
                        if (!r) return;
                        try {
                          await reverseFinancialMovement(m.id, r);
                          await load();
                        } catch(err) {
                          showError(err, 'عكس الحركة');
                        }
                      }}
                        style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',color:'var(--red)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
                        عكس ↩
                      </button>}
                    {m.is_reversed && <span style={{fontSize:10,color:'var(--text3)'}}>✓ مُعكوس</span>}
                    {m.is_reversal && <span style={{fontSize:10,color:'var(--amber)'}}>↩ تصحيح</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>}
        </div>
      </div>

      {/* Modal إضافة حركة */}
      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal" style={{maxWidth:600}}>
          <div className="modal-header">
            <span className="modal-title">إضافة حركة مالية</span>
            <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
          </div>
          <div className="modal-body" style={{maxHeight:'72vh',overflowY:'auto'}}>

            {/* وارد / صادر */}
            <div style={{display:'flex',gap:10,marginBottom:16}}>
              {[['in','▲ وارد','var(--green)'],['out','▼ صادر','var(--red)']].map(([val,label,color])=>(
                <button key={val} type="button" onClick={()=>setForm({...form,direction:val})}
                  style={{flex:1,padding:'10px',borderRadius:8,border:'2px solid',cursor:'pointer',fontFamily:'Cairo,sans-serif',fontSize:14,fontWeight:700,
                    background: form.direction===val?'rgba(0,0,0,.1)':'var(--bg3)',
                    borderColor: form.direction===val?color:'var(--border)',
                    color: form.direction===val?color:'var(--text2)',
                  }}>{label}</button>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">المبلغ (ج.م) <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" type="number" style={errors.amount?{borderColor:'var(--red)'}:{}} value={form.amount} onChange={e=>{setForm({...form,amount:e.target.value});setErrors({...errors,amount:false});}} placeholder="0"/>
                {errors.amount && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>مطلوب</div>}
              </div>
              <div className="form-group">
                <label className="form-label">التاريخ <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" type="date" value={form.movement_date} onChange={e=>setForm({...form,movement_date:e.target.value})}/>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">الحساب <span style={{color:'var(--red)'}}>*</span></label>
                <select className="form-select" style={errors.account_id?{borderColor:'var(--red)'}:{}} value={form.account_id} onChange={e=>{setForm({...form,account_id:e.target.value});setErrors({...errors,account_id:false});}}>
                  <option value="">اختر الحساب</option>
                  {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
                </select>
                {errors.account_id && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>مطلوب</div>}
              </div>
              <div className="form-group">
                <label className="form-label">نوع الحركة</label>
                <select className="form-select" value={form.movement_type} onChange={e=>setForm({...form,movement_type:e.target.value,category:''})}>
                  {Object.entries(mvTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* الفئة */}
            {currentCats.length>0 && <div className="form-group">
              <label className="form-label">الفئة</label>
              <select className="form-select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                <option value="">اختر الفئة</option>
                {currentCats.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>}

            {/* الربط الاختياري */}
            <div style={{background:'var(--bg3)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>ربط بـ (اختياري)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group"><label className="form-label">الكيان</label>
                  <select className="form-select" value={form.entity_id} onChange={e=>setForm({...form,entity_id:e.target.value})}>
                    <option value="">—</option>
                    {(entities||[]).map(e=><option key={e.role_record_id||e.id} value={e.role_record_id||e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">العملية</label>
                  <select className="form-select" value={form.deal_id} onChange={e=>setForm({...form,deal_id:e.target.value})}>
                    <option value="">—</option>
                    {deals.map(d=><option key={d.id} value={d.id}>{d.deal_number} — {d.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">الممول</label>
                  <select className="form-select" value={form.investor_id} onChange={e=>setForm({...form,investor_id:e.target.value})}>
                    <option value="">—</option>
                    {(investors||[]).map(i=><option key={i.role_record_id||i.id} value={i.role_record_id||i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">الوسيط</label>
                  <select className="form-select" value={form.broker_id} onChange={e=>setForm({...form,broker_id:e.target.value})}>
                    <option value="">—</option>
                    {brokers.map(b=><option key={b.role_record_id||b.id} value={b.role_record_id||b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              {form.deal_id && <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,marginTop:8}}>
                <input type="checkbox" checked={form.is_deal_expense} onChange={e=>setForm({...form,is_deal_expense:e.target.checked})} style={{width:14,height:14}}/>
                هذا مصروف مباشر على العملية
              </label>}
            </div>

            <div className="form-group">
              <label className="form-label">البيان</label>
              <input className="form-input" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="وصف مختصر للحركة"/>
            </div>
            <div className="form-group">
              <label className="form-label">ملاحظات</label>
              <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="اختياري"/>
            </div>

            {/* ملخص */}
            {form.amount && form.account_id && (() => {
              const acc = accounts.find(a=>a.id===form.account_id);
              if (!acc) return null;
              const newBal = form.direction==='in' ? Number(acc.balance)+Number(form.amount) : Number(acc.balance)-Number(form.amount);
              return <div style={{background: newBal<0?'rgba(239,68,68,.08)':'rgba(16,185,129,.08)', border:`1px solid ${newBal<0?'rgba(239,68,68,.2)':'rgba(16,185,129,.2)'}`, borderRadius:8,padding:'10px 14px',fontSize:13,marginTop:4}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>رصيد {acc.name} بعد الحركة</span>
                  <strong style={{color:newBal<0?'var(--red)':'var(--green)'}}>{fmt(newBal)}</strong>
                </div>
              </div>;
            })()}

          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={save} disabled={saving}>{saving?'جاري الحفظ...':'حفظ الحركة'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

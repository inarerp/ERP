function Cheques() {
  const [data, setData]       = useState([]);
  const [deals, setDeals]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDir, setFilterDir]       = useState('all');

  const emptyForm = { deal_id:'', cheque_number:'', bank:'', amount:'', due_date:'', direction:'in', status:'received', notes:'' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    const [{ data: c },{ data: d }] = await Promise.all([
      sb.from('cheques').select('*, deals(deal_number,name)').order('due_date').limit(500),
      sb.from('deals').select('id,deal_number,name').order('created_at',{ascending:false}).limit(500),
    ]);
    setData(c||[]); setDeals(d||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const validate = () => {
    const e = {};
    if (!form.amount)   e.amount = true;
    if (!form.due_date) e.due_date = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    await sb.from('cheques').insert([{
      deal_id: form.deal_id||null, cheque_number: form.cheque_number||null,
      bank: form.bank||null, amount: Number(form.amount),
      due_date: form.due_date, direction: form.direction,
      status: 'received', notes: form.notes||null, // P2A-09: always received on creation
    }]);
    setModal(false); setForm(emptyForm); setErrors({});
    await load(); setSaving(false);
  };

  // P2A-09: collection (deposited→collected) now requires account selection
  // and calls process_cheque_collection_atomic which creates a financial_movement.
  // All other transitions are logistical only — direct update + audit is fine.
  const [collectModal, setCollectModal] = useState(false);
  const [collectTarget, setCollectTarget]   = useState(null);   // cheque row
  const [collectAccountId, setCollectAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);

  const loadAccounts = async () => {
    const { data: a } = await sb.from('accounts').select('id,name,account_type').order('name').limit(500);
    setAccounts(a||[]);
  };

  const openCollectModal = async (cheque) => {
    setCollectTarget(cheque);
    await loadAccounts();
    setCollectAccountId('');
    setCollectModal(true);
  };

  const confirmCollect = async () => {
    if (!collectAccountId) { alert('اختر الحساب الذي سيُودَع فيه مبلغ الشيك'); return; }
    setSaving(true);
    try {
      await callRpc('process_cheque_collection_atomic', {
        p_cheque_id:       collectTarget.id,
        p_account_id:      collectAccountId,
        p_collection_date: new Date().toISOString().slice(0,10),
        p_idempotency_key: makeStableKey('cheque_collect', collectTarget.id),
      });
      setCollectModal(false); setCollectTarget(null);
      await load();
    } catch(err) { showError(err, 'تحصيل الشيك'); }
    setSaving(false);
  };

  const updateStatus = async (id, status, cheque) => {
    // logistical transitions only (no money changes hands)
    try {
      await sb.from('cheques').update({ status }).eq('id', id);
      await createAuditLog({
        action: 'cheque_status_changed', tableName:'cheques', recordId: id,
        oldValues:{ status: cheque?.status }, newValues:{ status },
      });
      await load();
    } catch(err) { showError(err); }
  };

  const STATUS = {
    received:  { label:'مستلم',         cls:'badge-blue' },
    deposited: { label:'مودع في البنك', cls:'badge-purple' },
    collected: { label:'تم التحصيل',    cls:'badge-green' },
    returned:  { label:'مرتجع',         cls:'badge-red' },
    cancelled: { label:'ملغي',          cls:'badge-gray' },
  };
  const nextStatus = { received:'deposited', deposited:'collected' };

  // ── ربط الشيك بأمر/أوامر توريد (يعتمد على البنية الموجودة من Phase 9:
  // supply_order_cheques + link_supply_order_cheque_atomic — هنا فقط
  // نعرض الواجهة، الجدول والـ RPC جاهزين بالفعل) ──
  const [linkModal, setLinkModal]     = useState(false);
  const [linkTarget, setLinkTarget]   = useState(null);   // الشيك المُراد ربطه
  const [dealOrders, setDealOrders]   = useState([]);      // أوامر توريد العملية
  const [alreadyLinked, setAlreadyLinked] = useState(new Set()); // أوامر مربوطة بالفعل بهذا الشيك
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [linking, setLinking] = useState(false);

  const openLinkModal = async (cheque) => {
    if (!cheque.deal_id) { alert('هذا الشيك غير مرتبط بأي عملية — اربطه بعملية أولاً'); return; }
    setLinkTarget(cheque);
    const [{ data: orders }, { data: links }] = await Promise.all([
      sb.from('v_supply_orders_with_cheques').select('*').eq('deal_id', cheque.deal_id).order('order_date',{ascending:false}),
      sb.from('supply_order_cheques').select('supply_order_id').eq('cheque_id', cheque.id),
    ]);
    const linkedSet = new Set((links||[]).map(l=>l.supply_order_id));
    setDealOrders(orders||[]);
    setAlreadyLinked(linkedSet);
    setSelectedOrderIds(new Set(linkedSet)); // مبدئيًا نفس المربوط حاليًا
    setLinkModal(true);
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const saveLinkChanges = async () => {
    setLinking(true);
    try {
      // نربط فقط الأوامر المُختارة حديثًا (اللي مكنتش مربوطة قبل كده)
      // ملاحظة: الـ RPC الحالية بتدعم الربط فقط وليس فك الربط —
      // لو حبيت تشيل ربطاً موجوداً، ده يحتاج قرار وRPC إضافية لاحقًا
      const toLink = [...selectedOrderIds].filter(id => !alreadyLinked.has(id));
      for (const orderId of toLink) {
        await sb.rpc('link_supply_order_cheque_atomic', {
          p_supply_order_id: orderId,
          p_cheque_id: linkTarget.id,
        });
      }
      setLinkModal(false);
      await load();
    } catch(err) { showError(err, 'ربط الشيك بأوامر التوريد'); }
    finally { setLinking(false); }
  };


  const today   = new Date(); today.setHours(0,0,0,0);
  const in7days = new Date(today); in7days.setDate(today.getDate()+7);

  const alertCheques = data.filter(c => {
    if (['collected','cancelled','returned'].includes(c.status)) return false;
    return new Date(c.due_date) <= in7days;
  });

  const filtered = data.filter(c => {
    if (filterStatus!=='all' && c.status!==filterStatus) return false;
    if (filterDir!=='all'    && c.direction!==filterDir) return false;
    return true;
  });

  const totalIn  = data.filter(c=>c.direction==='in'  && !['returned','cancelled'].includes(c.status)).reduce((a,c)=>a+Number(c.amount),0);
  const totalOut = data.filter(c=>c.direction==='out' && !['returned','cancelled'].includes(c.status)).reduce((a,c)=>a+Number(c.amount),0);
  const pending  = data.filter(c=>!['collected','cancelled','returned'].includes(c.status)).reduce((a,c)=>a+Number(c.amount),0);

  const daysUntil = (dateStr) => {
    const due = new Date(dateStr); due.setHours(0,0,0,0);
    const diff = Math.round((due - today) / 86400000);
    if (diff < 0)   return { label:'متأخر '+Math.abs(diff)+' يوم', color:'var(--red)' };
    if (diff === 0) return { label:'اليوم!', color:'var(--red)' };
    if (diff <= 3)  return { label:'بعد '+diff+' أيام', color:'var(--amber)' };
    return { label:'بعد '+diff+' يوم', color:'var(--text2)' };
  };

  return (
    <div className="content">
      {alertCheques.length > 0 && (
        <div style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',borderRadius:12,padding:'12px 16px',marginBottom:16}}>
          <div style={{fontWeight:600,fontSize:13,color:'var(--amber)',marginBottom:8}}>⚠️ شيكات تستحق قريباً ({alertCheques.length})</div>
          {alertCheques.map(c => {
            const d = daysUntil(c.due_date);
            return <div key={c.id} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid rgba(245,158,11,.1)'}}>
              <span>{c.cheque_number?'شيك '+c.cheque_number:'شيك'} — {c.bank||'—'} — {fmt(c.amount)}</span>
              <span style={{color:d.color,fontWeight:600}}>{d.label}</span>
            </div>;
          })}
        </div>
      )}

      <div className="stats-grid" style={{marginBottom:20}}>
        <StatCard label="شيكات وارد" valueClass="green" value={fmtShort(totalIn)} sub="من العملاء"/>
        <StatCard label="شيكات صادر" valueClass="red" value={fmtShort(totalOut)} sub="للممولين/الموردين"/>
        <StatCard label="إجمالي معلق" valueClass="amber" value={fmtShort(pending)} sub="لم يُحصَّل بعد"/>
        <div className="stat-card"><div className="stat-label">تنبيهات</div><div className={`stat-value ${alertCheques.length>0?'red':'green'}`}>{alertCheques.length}</div><div className="stat-sub">خلال 7 أيام</div></div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">الشيكات</span>
          <button className="topbar-btn btn-primary" onClick={()=>{ setForm(emptyForm); setErrors({}); setModal(true); }}><Icon d={Icons.plus}/> إضافة شيك</button>
        </div>
        <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap'}}>
          <select className="form-select" style={{width:'auto',minWidth:140}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="form-select" style={{width:'auto',minWidth:130}} value={filterDir} onChange={e=>setFilterDir(e.target.value)}>
            <option value="all">وارد وصادر</option><option value="in">وارد فقط</option><option value="out">صادر فقط</option>
          </select>
        </div>
        <div className="section-body">
          {loading ? <Loading/>
          : filtered.length===0 ? <Empty icon="🧾" title="لا توجد شيكات"/>
          : <table className="table">
              <thead><tr><th>الاتجاه</th><th>رقم الشيك</th><th>البنك</th><th>المبلغ</th><th>الاستحقاق</th><th>العملية</th><th>الحالة</th><th>إجراء</th></tr></thead>
              <tbody>{filtered.map(c => {
                const d = daysUntil(c.due_date);
                const ns = nextStatus[c.status];
                return <tr key={c.id}>
                  <td><span className={`badge ${c.direction==='in'?'badge-green':'badge-red'}`}>{c.direction==='in'?'▲ وارد':'▼ صادر'}</span></td>
                  <td style={{fontFamily:'monospace',fontSize:12}}>{c.cheque_number||'—'}</td>
                  <td style={{color:'var(--text2)'}}>{c.bank||'—'}</td>
                  <td style={{fontWeight:700,color:c.direction==='in'?'var(--green)':'var(--red)'}}>{fmt(c.amount)}</td>
                  <td><div>{c.due_date}</div>{!['collected','cancelled','returned'].includes(c.status)&&<div style={{fontSize:11,color:d.color,fontWeight:600}}>{d.label}</div>}</td>
                  <td style={{fontSize:12,color:'var(--text2)'}}>{c.deals?.deal_number||'—'}</td>
                  <td><span className={`badge ${STATUS[c.status]?.cls||'badge-gray'}`}>{STATUS[c.status]?.label||c.status}</span></td>
                  <td style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {/* deposited→collected: requires account selection + creates financial_movement */}
                    {c.status==='deposited' && (
                      <button onClick={()=>openCollectModal(c)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',color:'var(--green)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
                        تحصيل ✓
                      </button>
                    )}
                    {/* received→deposited: logistical only */}
                    {c.status==='received' && (
                      <button onClick={()=>updateStatus(c.id,'deposited',c)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
                        إيداع في البنك ←
                      </button>
                    )}
                    {/* received→returned: logistical only */}
                    {c.status==='received'&&<button onClick={()=>updateStatus(c.id,'returned',c)} style={{fontSize:11,padding:'3px 7px',borderRadius:6,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',color:'var(--red)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>مرتجع</button>}
                    {/* ربط بأوامر توريد — متاح فقط لو الشيك مرتبط بعملية */}
                    {c.deal_id && (
                      <button onClick={()=>openLinkModal(c)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(61,127,255,.08)',border:'1px solid rgba(61,127,255,.3)',color:'var(--accent)',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
                        🔗 أوامر توريد
                      </button>
                    )}
                  </td>
                </tr>;
              })}</tbody>
            </table>}
        </div>
      </div>

      {modal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
        <div className="modal" style={{maxWidth:540}}>
          <div className="modal-header"><span className="modal-title">إضافة شيك جديد</span><button className="modal-close" onClick={()=>setModal(false)}>✕</button></div>
          <div className="modal-body">
            <div style={{display:'flex',gap:10,marginBottom:16}}>
              {[['in','▲ وارد (من العميل)','var(--green)'],['out','▼ صادر (للمورد)','var(--red)']].map(([val,label,color])=>(
                <button key={val} type="button" onClick={()=>setForm({...form,direction:val})} style={{flex:1,padding:'9px',borderRadius:8,border:'2px solid',cursor:'pointer',fontFamily:'Cairo,sans-serif',fontSize:13,fontWeight:700,background:form.direction===val?'rgba(0,0,0,.08)':'var(--bg3)',borderColor:form.direction===val?color:'var(--border)',color:form.direction===val?color:'var(--text2)'}}>{label}</button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">المبلغ (ج.م) <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" type="number" style={errors.amount?{borderColor:'var(--red)'}:{}} value={form.amount} onChange={e=>{setForm({...form,amount:e.target.value});setErrors({...errors,amount:false});}} placeholder="0"/>
              </div>
              <div className="form-group"><label className="form-label">تاريخ الاستحقاق <span style={{color:'var(--red)'}}>*</span></label>
                <input className="form-input" type="date" style={errors.due_date?{borderColor:'var(--red)'}:{}} value={form.due_date} onChange={e=>{setForm({...form,due_date:e.target.value});setErrors({...errors,due_date:false});}}/>
              </div>
              <div className="form-group"><label className="form-label">رقم الشيك</label>
                <input className="form-input" value={form.cheque_number} onChange={e=>setForm({...form,cheque_number:e.target.value})} placeholder="اختياري"/>
              </div>
              <div className="form-group"><label className="form-label">البنك</label>
                <input className="form-input" value={form.bank} onChange={e=>setForm({...form,bank:e.target.value})} placeholder="مثال: CIB"/>
              </div>
              {/* P2A-09: Status locked to 'received' on creation.
                   A new cheque is always 'received' — transitions happen via action buttons. */}
              <div className="form-group"><label className="form-label">الحالة</label>
                <div className="form-input" style={{background:'var(--bg3)',color:'var(--text2)',cursor:'not-allowed'}}>
                  مستلم (الحالة الافتراضية)
                </div>
              </div>
              <div className="form-group"><label className="form-label">مرتبط بعملية</label>
                <select className="form-select" value={form.deal_id} onChange={e=>setForm({...form,deal_id:e.target.value})}>
                  <option value="">— بدون ربط —</option>
                  {deals.map(d=><option key={d.id} value={d.id}>{d.deal_number} — {d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="اختياري"/>
            </div>
            {form.due_date && <div style={{background:'var(--bg3)',borderRadius:8,padding:'8px 14px',fontSize:13}}>
              {(()=>{ const d=daysUntil(form.due_date); return <span style={{color:d.color}}>⏰ {d.label}</span>; })()}
            </div>}
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={save} disabled={saving}>{saving?'جاري الحفظ...':'حفظ الشيك'}</button>
          </div>
        </div>
      </div>}

      {/* P2A-09: Collect modal — picks account then calls process_cheque_collection_atomic */}
      {collectModal && collectTarget && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setCollectModal(false)}>
        <div className="modal" style={{maxWidth:420}}>
          <div className="modal-header">
            <span className="modal-title">تحصيل الشيك</span>
            <button className="modal-close" onClick={()=>setCollectModal(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div style={{background:'var(--bg3)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4}}>
                {collectTarget.cheque_number ? 'شيك رقم ' + collectTarget.cheque_number : 'شيك'} — {collectTarget.bank||'—'}
              </div>
              <div style={{color:'var(--green)',fontWeight:700,fontSize:16}}>{fmt(collectTarget.amount)}</div>
            </div>
            <div className="form-group">
              <label className="form-label">الحساب الذي سيُودَع فيه المبلغ <span style={{color:'var(--red)'}}>*</span></label>
              <select className="form-select" value={collectAccountId} onChange={e=>setCollectAccountId(e.target.value)}>
                <option value="">— اختر الحساب —</option>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:8}}>
              💡 سيُنشأ تلقائياً حركة مالية بمبلغ {fmt(collectTarget.amount)} في الحساب المختار.
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setCollectModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={confirmCollect} disabled={saving||!collectAccountId}>
              {saving?'جاري التحصيل...':'✓ تأكيد التحصيل'}
            </button>
          </div>
        </div>
      </div>}

      {linkModal && linkTarget && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setLinkModal(false)}>
        <div className="modal" style={{maxWidth:460}}>
          <div className="modal-header">
            <span className="modal-title">ربط الشيك بأوامر توريد</span>
            <button className="modal-close" onClick={()=>setLinkModal(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div style={{background:'var(--bg3)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4}}>
                {linkTarget.cheque_number ? 'شيك رقم ' + linkTarget.cheque_number : 'شيك'} — {linkTarget.deals?.deal_number||''}
              </div>
              <div style={{color:'var(--green)',fontWeight:700,fontSize:16}}>{fmt(linkTarget.amount)}</div>
            </div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
              شيك واحد ممكن يغطي أمر توريد واحد أو أكتر — اختر الأوامر اللي بيغطيها الشيك ده.
            </div>
            {dealOrders.length===0
              ? <Empty icon="📦" title="لا توجد أوامر توريد لهذه العملية"/>
              : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {dealOrders.map(o=>(
                    <label key={o.id} style={{
                      display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                      borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',
                      background: selectedOrderIds.has(o.id) ? 'rgba(61,127,255,.08)' : 'var(--bg3)',
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(o.id)}
                        onChange={()=>toggleOrderSelection(o.id)}
                        disabled={alreadyLinked.has(o.id)}
                        style={{width:16,height:16}}
                      />
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>
                          {o.order_number || 'أمر بدون رقم'}
                          {alreadyLinked.has(o.id) && <span style={{fontSize:11,color:'var(--green)',marginRight:6}}>✓ مربوط بالفعل</span>}
                        </div>
                        <div style={{fontSize:11,color:'var(--text3)'}}>{o.order_date} — متوقَّع: {fmt(o.expected_amount)}</div>
                      </div>
                    </label>
                  ))}
                </div>}
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setLinkModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveLinkChanges} disabled={linking}>
              {linking?'جاري الربط...':'حفظ الربط'}
            </button>
          </div>
        </div>
      </div>}

    </div>
  );
}

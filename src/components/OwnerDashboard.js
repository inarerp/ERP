function OwnerDashboard() {
  const [deals, setDeals] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount:'', payment_date: new Date().toISOString().slice(0,10), account_id:'', notes:'', _nonce: makeNonce() });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: d },{ data: p }] = await Promise.all([
      sb.from('deals').select('*, entities(name), clients(name)').not('owner_profit','is',null).order('created_at',{ascending:false}),
      sb.from('payments').select('*').eq('payee_type','owner').order('payment_date',{ascending:false}),
    ]);
    setDeals(d||[]); setPayments(p||[]); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);

  const totalDue = deals.reduce((a,d)=>a+Number(d.owner_profit||0),0);
  const totalPaid = payments.reduce((a,p)=>a+Number(p.amount||0),0);
  const remaining = totalDue - totalPaid;

  const savePay = async () => {
    if (!payForm.amount) return;
    setSaving(true);
    await callRpc('record_payment_atomic', {
      p_payee_type:      'owner',
      p_payee_id:        OWNER_PAYEE_ID,
      p_payment_type:    'profit',
      p_amount:          assertPositiveAmount(payForm.amount, 'مبلغ السحب'),
      p_account_id:      payForm.account_id || null,
      p_deal_id:         null,
      p_notes:           payForm.notes || 'سحب أرباح المالك',
      p_idempotency_key: makeStableKey('owner_pay', payForm._nonce),
    });
    setPayModal(false); setPayForm({ amount:'', payment_date: new Date().toISOString().slice(0,10), account_id:'', notes:'', _nonce: makeNonce() });
    await load(); setSaving(false);
  };

  if (loading) return <Loading/>;

  return (
    <div className="content">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:3}}>أرباح المالك — عمرو</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>ملخص الأرباح المستحقة من كل العمليات</div>
        </div>
        {remaining > 0 && <button className="topbar-btn btn-primary" onClick={()=>setPayModal(true)}>+ تسجيل سحب</button>}
      </div>

      <div className="stats-grid" style={{marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">إجمالي الأرباح المستحقة</div><div className="stat-value green">{fmtShort(totalDue)}</div><div className="stat-sub">من {deals.length} عملية</div></div>
        <StatCard label="إجمالي المسحوب" valueClass="blue" value={fmtShort(totalPaid)}/>
        <div className="stat-card">
          <div className="stat-label">المتبقي في الحساب</div>
          <div className={`stat-value ${remaining>=0?'amber':'red'}`}>{fmtShort(remaining)}</div>
          <div className="stat-sub">لم يُسحب بعد</div>
        </div>
      </div>

      <div className="section" style={{marginBottom:16}}>
        <div className="section-header"><span className="section-title">الأرباح من كل عملية</span></div>
        {deals.length===0
          ? <Empty icon="💼" title="لا توجد أرباح مسجّلة بعد" sub="الأرباح تُضاف عند توزيع أرباح كل عملية"/>
          : <table className="table">
              <thead><tr><th>رقم العملية</th><th>الاسم</th><th>الكيان</th><th>نصيب عمرو</th><th>الحالة</th></tr></thead>
              <tbody>{deals.map(d=>(
                <tr key={d.id}>
                  <td style={{fontFamily:'monospace',fontSize:12,color:'var(--text2)'}}>{d.deal_number}</td>
                  <td style={{fontWeight:600}}>{d.name}</td>
                  <td>{d.entities?.name||'—'}</td>
                  <td style={{color:'var(--green)',fontWeight:600}}>{fmt(d.owner_profit)}</td>
                  <td><span className={`badge ${(STATUS_MAP[d.status]||{cls:'badge-gray'}).cls}`}>{(STATUS_MAP[d.status]||{label:'—'}).label}</span></td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      <div className="section">
        <div className="section-header"><span className="section-title">سجل السحوبات</span></div>
        {payments.length===0
          ? <Empty icon="💳" title="لا توجد سحوبات"/>
          : <table className="table">
              <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th></tr></thead>
              <tbody>{payments.map(p=>(
                <tr key={p.id}>
                  <td>{p.payment_date}</td>
                  <td style={{color:'var(--green)',fontWeight:600}}>{fmt(p.amount)}</td>
                  <td style={{color:'var(--text2)'}}>{p.notes||'—'}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      {payModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPayModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">تسجيل سحب أرباح</span><button className="modal-close" onClick={()=>setPayModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>المتاح للسحب: {fmt(remaining)}</div>
            </div>
            <div className="form-group"><label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={payForm.payment_date} onChange={e=>setPayForm({...payForm,payment_date:e.target.value})}/>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setPayModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={savePay} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

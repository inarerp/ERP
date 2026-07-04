function BrokerDetail({ brokerId, onBack }) {
  const [broker, setBroker] = useState(null);
  const [deals, setDeals] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount:'', payment_date: new Date().toISOString().slice(0,10), account_id:'', notes:'', _nonce: makeNonce() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: b },{ data: db },{ data: p }] = await Promise.all([
      sb.from('brokers').select('*').eq('id', brokerId).single(),
      sb.from('deal_brokers').select('*, deals(deal_number,name,status,value)').eq('broker_id', brokerId),
      sb.from('payments').select('*').eq('payee_type','broker').eq('payee_id', brokerId).order('payment_date',{ascending:false}),
    ]);
    setBroker(b); setDeals(db||[]); setPayments(p||[]); setLoading(false);
  },[brokerId]);
  useEffect(()=>{ load(); },[load]);

  const savePay = async () => {
    if (saving) return;
    try {
      const amt      = assertPositiveAmount(payForm.amount, 'مبلغ العمولة');
      const remaining = Number(broker.commission_due||0) - Number(broker.commission_paid||0);
      if (amt > remaining + 0.01)
        throw new Error(`المبلغ (${amt.toLocaleString('ar-EG')}) أكبر من العمولة المتبقية (${remaining.toLocaleString('ar-EG')})`);
      setSaving(true);
      await callRpc('record_payment_atomic', {
        p_payee_type:      'broker',
        p_payee_id:        brokerId,
        p_payment_type:    'commission',
        p_amount:          amt,
        p_account_id:      payForm.account_id || null,
        p_deal_id:         null,
        p_notes:           payForm.notes || 'دفع عمولة وسيط',
        p_idempotency_key: makeStableKey('broker_pay', brokerId, payForm._nonce),
      });
      setPayModal(false); setPayForm({ amount:'', payment_date: todayStr(), account_id:'', notes:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  if (loading) return <Loading/>;
  if (!broker) return null;

  const remaining = Number(broker.commission_due||0) - Number(broker.commission_paid||0);

  return (
    <div className="content">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="topbar-btn btn-ghost" onClick={onBack}>← رجوع</button>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:3}}>{broker.name}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{broker.phone||''}</div>
        </div>
        {remaining > 0 && <button className="topbar-btn btn-primary" onClick={()=>setPayModal(true)}>+ تسجيل دفعة</button>}
      </div>

      <div className="stats-grid" style={{marginBottom:20}}>
        <StatCard label="العمولات المستحقة" valueClass="amber" value={fmtShort(broker.commission_due)}/>
        <StatCard label="العمولات المدفوعة" valueClass="green" value={fmtShort(broker.commission_paid)}/>
        <div className="stat-card">
          <div className="stat-label">المتبقي</div>
          <div className={`stat-value ${remaining>0?'red':'green'}`}>{fmtShort(remaining)}</div>
        </div>
        <StatCard label="عدد العمليات" valueClass="blue" value={deals.length}/>
      </div>

      <div className="section" style={{marginBottom:16}}>
        <div className="section-header"><span className="section-title">العمليات المرتبطة</span></div>
        {deals.length===0
          ? <Empty icon="📋" title="لا توجد عمليات"/>
          : <table className="table">
              <thead><tr><th>رقم العملية</th><th>الاسم</th><th>قيمة العملية</th><th>نوع العمولة</th><th>العمولة</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
              <tbody>{deals.map(d=>(
                <tr key={d.id}>
                  <td style={{fontFamily:'monospace',fontSize:12,color:'var(--text2)'}}>{d.deals?.deal_number}</td>
                  <td style={{fontWeight:600}}>{d.deals?.name}</td>
                  <td>{fmt(d.deals?.value)}</td>
                  <td><span className="badge badge-gray">{d.commission_type==='percentage'?'نسبة %':'مبلغ ثابت'}</span></td>
                  <td style={{color:'var(--amber)'}}>{fmt(d.commission_due)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(d.commission_paid)}</td>
                  <td style={{color:'var(--red)'}}>{fmt(Number(d.commission_due)-Number(d.commission_paid))}</td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      <div className="section">
        <div className="section-header"><span className="section-title">كشف حساب المدفوعات</span></div>
        {payments.length===0
          ? <Empty icon="💳" title="لا توجد مدفوعات"/>
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
          <div className="modal-header"><span className="modal-title">تسجيل دفعة للوسيط</span><button className="modal-close" onClick={()=>setPayModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>المتبقي: {fmt(remaining)}</div>
            </div>
            <div className="form-group"><label className="form-label">تاريخ الدفع</label>
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

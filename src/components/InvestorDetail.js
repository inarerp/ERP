function InvestorDetail({ investorId, onBack }) {
  const [inv, setInv]           = useState(null);
  const [deals, setDeals]       = useState([]);
  const [ledger, setLedger]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [tab, setTab]           = useState('overview');
  // يتتبع أي استعلام فشل أثناء load() — يُستخدم لعرض تحذير بدل بيانات ناقصة صامتة
  const [dataWarnings, setDataWarnings] = useState([]);

  // Modals
  const [depModal, setDepModal]       = useState(false);
  const [withModal, setWithModal]     = useState(false);
  const [profPayModal, setProfPayModal] = useState(false);
  const [returnModal, setReturnModal] = useState(null); // deal_investor row

  // _nonce is generated once per modal open — stays fixed across retries
  const [depForm,     setDepForm]     = useState({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
  const [withForm,    setWithForm]    = useState({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
  const [profPayForm, setProfPayForm] = useState({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
  const [retForm,     setRetForm]     = useState({ amount:'', notes:'' });

  // ── helper: add ledger entry + update balances ──

  const load = useCallback(async () => {
    const [rInv, rDi, rLg] = await Promise.all([
      safeQuery(sb.from('investors').select('*').eq('id', investorId).single(), 'investor'),
      safeQuery(sb.from('deal_investors').select('*, deals(id,deal_number,name,status,value)').eq('investor_id', investorId), 'deal_investors'),
      safeQuery(sb.from('investor_ledger').select('*').eq('investor_id', investorId).order('created_at', { ascending: false }).limit(200), 'investor_ledger'),
    ]);
    // investor query uses .single() فتُرجع كائناً وليس مصفوفة — نتعامل معها بشكل خاص
    setInv(Array.isArray(rInv.data) ? (rInv.data[0]||null) : rInv.data);
    setDeals(rDi.data);
    setLedger(rLg.data);
    setDataWarnings([rInv, rDi, rLg].filter(r => r.hasError).map(r => r.label));
    setLoading(false);
  },[investorId]);
  useEffect(()=>{ load(); },[load]);

  // ── إيداع رصيد ──
  const saveDeposit = async () => {
    if (saving) return;
    try {
      const amt = assertPositiveAmount(depForm.amount, 'مبلغ الإيداع');
      setSaving(true);
      await callRpc('investor_deposit_atomic', {
        p_investor_id:     investorId,
        p_amount:          amt,
        p_account_id:      depForm.account_id || null,
        p_notes:           depForm.notes      || 'إيداع رصيد جديد',
        p_idempotency_key: makeStableKey('deposit', investorId, depForm._nonce),
      });
      setDepModal(false); setDepForm({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  // ── سحب رأس المال (نقداً) ──
  const saveWithdrawal = async () => {
    if (saving) return;
    try {
      const amt    = assertPositiveAmount(withForm.amount, 'مبلغ السحب');
      const avail  = Number(inv.available_balance || 0);
      if (amt > avail)
        throw new Error(`المبلغ (${amt.toLocaleString('ar-EG')}) أكبر من الرصيد المتاح (${avail.toLocaleString('ar-EG')})`);
      setSaving(true);
      await callRpc('investor_withdrawal_atomic', {
        p_investor_id:     investorId,
        p_amount:          amt,
        p_account_id:      withForm.account_id || null,
        p_notes:           withForm.notes      || 'سحب رأس مال',
        p_idempotency_key: makeStableKey('withdraw', investorId, withForm._nonce),
      });
      setWithModal(false); setWithForm({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  // ── دفع أرباح ──
  const saveProfitPayment = async () => {
    if (saving) return;
    try {
      const amt    = assertPositiveAmount(profPayForm.amount, 'مبلغ الأرباح');
      const netDue = Number(inv.profit_due||0) - Number(inv.profit_paid||0);
      if (amt > netDue + 0.01)
        throw new Error(`المبلغ (${amt.toLocaleString('ar-EG')}) أكبر من الأرباح المتبقية (${netDue.toLocaleString('ar-EG')})`);
      setSaving(true);
      await callRpc('record_payment_atomic', {
        p_payee_type:      'investor',
        p_payee_id:        investorId,
        p_payment_type:    'profit',
        p_amount:          amt,
        p_account_id:      profPayForm.account_id || null,
        p_deal_id:         null,
        p_notes:           profPayForm.notes || 'دفع أرباح',
        p_idempotency_key: makeStableKey('profit_pay', investorId, profPayForm._nonce),
      });
      setProfPayModal(false); setProfPayForm({ amount:'', account_id:'', notes:'', _nonce: makeNonce() });
      await load();
    } catch(err) { showError(err); }
    setSaving(false);
  };

  // ── إرجاع رأس المال من عملية ──
  const saveCapitalReturn = async () => {
    if (saving) return;
    if (!retForm.amount || !returnModal) return;
    const dealInv   = returnModal;
    const maxReturn = Number(dealInv.amount) - Number(dealInv.principal_returned||0);
    setSaving(true);
    try {
      const amt = assertPositiveAmount(retForm.amount, 'مبلغ الإرجاع');
      if (maxReturn <= 0) throw new Error('تم إرجاع رأس المال بالكامل مسبقاً');
      if (amt > maxReturn + 0.001) throw new Error(`لا يمكن إرجاع أكثر من المتبقي (${maxReturn.toLocaleString('ar-EG')} ج.م)`);
      await callRpc('return_investor_capital', {
        p_investor_id:      investorId,
        p_deal_investor_id: dealInv.id,
        p_deal_id:          dealInv.deals?.id || null,
        p_deal_number:      dealInv.deals?.deal_number || '',
        p_amount:           amt,
        p_notes:            retForm.notes || null,
        p_idempotency_key:  makeStableKey('cap_return', dealInv.id, String(amt)),
      });
      setReturnModal(null); setRetForm({ amount:'', notes:'' });
      await load();
    } catch(err) { showError(err, 'إرجاع رأس المال'); }
    finally { setSaving(false); }
  };

  // ── حجز / تحرير رصيد (Reserved) ──
  const reserveBalance = async (dealInv, action) => {
    try {
      const amt = assertPositiveAmount(dealInv.amount, 'مبلغ الحجز');
      await callRpc('investor_reserve_atomic', {
        p_investor_id:     investorId,
        p_deal_id:         dealInv.deals?.id   || null,
        p_deal_number:     dealInv.deals?.deal_number || '',
        p_amount:          amt,
        p_action:          action, // 'reserve' | 'release'
        p_idempotency_key: makeStableKey('reserve', investorId, dealInv.deals?.id || '', action),
      });
      await load();
    } catch(err) { showError(err); }
  };

  if (loading) return <Loading/>;
  if (!inv) return null;

  const activeDeals    = deals.filter(d=>['funded','executing','delivering','collecting','partial_collected'].includes(d.deals?.status));
  const completedDeals = deals.filter(d=>['fully_collected','closed'].includes(d.deals?.status));
  const studyDeals     = deals.filter(d=>['studying'].includes(d.deals?.status));
  const netProfit      = Number(inv.profit_due||0) - Number(inv.profit_paid||0);
  const totalCapital   = deals.reduce((a,d)=>a+Number(d.amount||0),0);
  const totalReturned  = deals.reduce((a,d)=>a+Number(d.principal_returned||0),0);

  const ledgerTypeMap = {
    deposit:'إيداع', allocation:'تخصيص لعملية', reservation:'حجز',
    reservation_cancel:'إلغاء حجز', capital_return:'إرجاع رأس مال',
    capital_withdrawal:'سحب رأس مال', profit_credit:'ربح مضاف',
    profit_payment:'دفع أرباح',
  };
  const ledgerColors = {
    deposit:'var(--green)', capital_return:'var(--green)', profit_credit:'var(--green)',
    capital_withdrawal:'var(--red)', profit_payment:'var(--red)', allocation:'var(--accent)',
    reservation:'var(--amber)', reservation_cancel:'var(--text2)',
  };
  const ledgerDir = { deposit:'+', capital_return:'+', profit_credit:'+', capital_withdrawal:'-', profit_payment:'-', allocation:'-', reservation:'-', reservation_cancel:'+' };

  // تحذير عند فشل أي استعلام في load() — نفس النمط المستخدم في DealDetail
  const hasDataWarning = dataWarnings.length > 0;
  const dataWarningMsg = hasDataWarning
    ? `⚠️ بعض البيانات لم تُحمَّل (${dataWarnings.join('، ')}) — الأرقام قد لا تكون دقيقة. أعد المحاولة قبل تنفيذ أي عملية مالية.`
    : '';

  return (
    <div className="content">
      {/* P2A-03: Data warning banner — shown when critical queries failed */}
      {hasDataWarning && (
        <div style={{
          background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.4)',
          borderRadius:10, padding:'10px 16px', marginBottom:14,
          display:'flex', alignItems:'flex-start', gap:10
        }}>
          <span style={{fontSize:20,lineHeight:1}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'var(--amber)',marginBottom:3,fontSize:13}}>
              بيانات غير مكتملة — الأرقام المالية قد لا تكون دقيقة
            </div>
            <div style={{fontSize:12,color:'var(--text2)',marginBottom:8}}>{dataWarningMsg}</div>
            <button className="topbar-btn btn-ghost" style={{fontSize:12,padding:'3px 10px'}}
              onClick={()=>{ setLoading(true); load(); }}>
              🔄 إعادة تحميل البيانات
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <button className="topbar-btn btn-ghost" onClick={onBack}>← رجوع</button>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:3}}>{inv.name}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{inv.phone||''}{inv.email?' · '+inv.email:''}</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="topbar-btn btn-primary" onClick={()=>setDepModal(true)}>+ إيداع</button>
          {Number(inv.available_balance)>0 && <button className="topbar-btn btn-ghost" onClick={()=>setWithModal(true)}>سحب رأس مال</button>}
          {netProfit>0 && <button className="topbar-btn btn-ghost" style={{color:'var(--green)',borderColor:'var(--green)'}} onClick={()=>setProfPayModal(true)}>دفع أرباح</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:16}}>
        <StatCard label="الرصيد المتاح" valueClass="green" value={fmtShort(inv.available_balance)} sub="جاهز للاستثمار"/>
        <StatCard label="الرصيد المحجوز" valueClass="amber" value={fmtShort(inv.reserved_balance)} sub="تحت الدراسة"/>
        <StatCard label="الرصيد العامل" valueClass="blue" value={fmtShort(inv.working_balance)} sub="في عمليات نشطة"/>
        <div className="stat-card">
          <div className="stat-label">إجمالي رأس المال</div>
          <div className="stat-value">{fmtShort(totalCapital)}</div>
          <div className="stat-sub">مُرجَع: {fmt(totalReturned)}</div>
        </div>
        <div className="stat-card"><div className="stat-label">الأرباح المستحقة</div><div className="stat-value amber">{fmtShort(inv.profit_due)}</div><div className="stat-sub">مدفوع: {fmt(inv.profit_paid)}</div></div>
        <div className="stat-card">
          <div className="stat-label">صافي أرباح متبقية</div>
          <div className={`stat-value ${netProfit>=0?'green':'red'}`}>{fmtShort(netProfit)}</div>
          <div className="stat-sub">لم يُسدَّد بعد</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="section">
        <div className="tabs">
          {[['overview','العمليات'],['ledger','كشف الحساب الكامل']].map(([k,l])=>(
            <button key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* العمليات */}
        {tab==='overview' && <div>
          {/* عمليات نشطة */}
          {activeDeals.length>0 && <>
            <div style={{padding:'10px 18px',fontSize:12,fontWeight:600,color:'var(--text2)',background:'var(--bg3)',borderBottom:'1px solid var(--border)'}}>عمليات نشطة — الرصيد العامل</div>
            <table className="table">
              <thead><tr><th>العملية</th><th>المبلغ</th><th>نوع العائد</th><th>ربح مستحق</th><th>رأس مال مُرجَع</th><th>إجراء</th></tr></thead>
              <tbody>{activeDeals.map(d=>(
                <tr key={d.id}>
                  <td><div style={{fontWeight:600}}>{d.deals?.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{d.deals?.deal_number}</div></td>
                  <td style={{color:'var(--accent)',fontWeight:600}}>{fmt(d.amount)}</td>
                  <td><span className="badge badge-gray">{{profit_percentage:'% ربح',capital_percentage:'% رأسمال',fixed_amount:'ثابت',custom:'خاص'}[d.return_type]||d.return_type}</span></td>
                  <td style={{color:'var(--amber)'}}>{fmt(d.profit_due)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(d.principal_returned)}</td>
                  <td><button className="topbar-btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>{ setReturnModal(d); setRetForm({ amount: String(Number(d.amount)-Number(d.principal_returned||0)), notes:'' }); }}>إرجاع رأس مال</button></td>
                </tr>
              ))}</tbody>
            </table>
          </>}

          {/* عمليات تحت الدراسة */}
          {studyDeals.length>0 && <>
            <div style={{padding:'10px 18px',fontSize:12,fontWeight:600,color:'var(--text2)',background:'var(--bg3)',borderBottom:'1px solid var(--border)',borderTop:'1px solid var(--border)'}}>تحت الدراسة — رصيد يمكن حجزه</div>
            <table className="table">
              <thead><tr><th>العملية</th><th>المبلغ</th><th>الحالة</th><th>حجز / تحرير</th></tr></thead>
              <tbody>{studyDeals.map(d=>(
                <tr key={d.id}>
                  <td><div style={{fontWeight:600}}>{d.deals?.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{d.deals?.deal_number}</div></td>
                  <td style={{color:'var(--amber)',fontWeight:600}}>{fmt(d.amount)}</td>
                  <td><span className="badge badge-gray">{(STATUS_MAP[d.deals?.status]||{label:'—'}).label}</span></td>
                  <td style={{display:'flex',gap:6}}>
                    <button className="topbar-btn btn-ghost" style={{fontSize:12,padding:'4px 10px',color:'var(--amber)',borderColor:'var(--amber)'}} onClick={()=>reserveBalance(d,'reserve')}>حجز</button>
                    <button className="topbar-btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}} onClick={()=>reserveBalance(d,'release')}>تحرير</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </>}

          {/* عمليات منتهية */}
          {completedDeals.length>0 && <>
            <div style={{padding:'10px 18px',fontSize:12,fontWeight:600,color:'var(--text2)',background:'var(--bg3)',borderBottom:'1px solid var(--border)',borderTop:'1px solid var(--border)'}}>عمليات منتهية</div>
            <table className="table">
              <thead><tr><th>العملية</th><th>المبلغ</th><th>ربح</th><th>رأس مال مُرجَع</th></tr></thead>
              <tbody>{completedDeals.map(d=>(
                <tr key={d.id}>
                  <td><div style={{fontWeight:600}}>{d.deals?.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{d.deals?.deal_number}</div></td>
                  <td>{fmt(d.amount)}</td>
                  <td style={{color:'var(--green)'}}>{fmt(d.profit_due)}</td>
                  <td><span className={`badge ${Number(d.principal_returned)>=Number(d.amount)?'badge-green':'badge-amber'}`}>{fmt(d.principal_returned)} {Number(d.principal_returned)>=Number(d.amount)?'✓ كامل':'جزئي'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </>}

          {deals.length===0 && <Empty icon="📋" title="لا توجد عمليات"/>}
        </div>}

        {/* كشف الحساب الكامل */}
        {tab==='ledger' && <div>
          <div style={{padding:'10px 18px',borderBottom:'1px solid var(--border)',fontSize:13,color:'var(--text2)'}}>
            إجمالي {ledger.length} حركة — الرصيد الحالي: <strong style={{color:'var(--green)'}}>{fmt(inv.available_balance)}</strong>
          </div>
          {ledger.length===0
            ? <Empty icon="📒" title="لا توجد حركات بعد"/>
            : <table className="table">
                <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>ملاحظات</th></tr></thead>
                <tbody>{ledger.map(l=>(
                  <tr key={l.id}>
                    <td style={{fontSize:12,color:'var(--text2)'}}>{new Date(l.created_at).toLocaleDateString('ar-EG')}</td>
                    <td><span className="badge badge-gray" style={{color:ledgerColors[l.movement_type]||'var(--text2)'}}>{ledgerTypeMap[l.movement_type]||l.movement_type}</span></td>
                    <td style={{fontWeight:700,color:ledgerColors[l.movement_type]||'var(--text)'}}>
                      {ledgerDir[l.movement_type]||''}{fmt(l.amount)}
                    </td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{fmt(l.balance_before)}</td>
                    <td style={{fontWeight:600,fontSize:12}}>{fmt(l.balance_after)}</td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{l.notes||'—'}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>}
      </div>

      {/* Modal: إيداع */}
      {depModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setDepModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إيداع رصيد جديد</span><button className="modal-close" onClick={()=>setDepModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={depForm.amount} onChange={e=>setDepForm({...depForm,amount:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>الرصيد الحالي: {fmt(inv.available_balance)}</div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={depForm.notes} onChange={e=>setDepForm({...depForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setDepModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveDeposit} disabled={saving}>{saving?'جاري الحفظ...':'حفظ'}</button>
          </div>
        </div>
      </div>}

      {/* Modal: سحب رأس مال */}
      {withModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setWithModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">سحب رأس المال</span><button className="modal-close" onClick={()=>setWithModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={withForm.amount} onChange={e=>setWithForm({...withForm,amount:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>الرصيد المتاح: {fmt(inv.available_balance)}</div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={withForm.notes} onChange={e=>setWithForm({...withForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setWithModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" style={{background:'var(--red)'}} onClick={saveWithdrawal} disabled={saving}>{saving?'جاري الحفظ...':'تأكيد السحب'}</button>
          </div>
        </div>
      </div>}

      {/* Modal: دفع أرباح */}
      {profPayModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setProfPayModal(false)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">دفع أرباح</span><button className="modal-close" onClick={()=>setProfPayModal(false)}>✕</button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">المبلغ (ج.م)</label>
              <input className="form-input" type="number" value={profPayForm.amount} onChange={e=>setProfPayForm({...profPayForm,amount:e.target.value})} placeholder="0"/>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>الأرباح المتبقية: {fmt(netProfit)}</div>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={profPayForm.notes} onChange={e=>setProfPayForm({...profPayForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setProfPayModal(false)}>إلغاء</button>
            <button className="topbar-btn btn-primary" style={{background:'var(--green)'}} onClick={saveProfitPayment} disabled={saving}>{saving?'جاري الحفظ...':'تأكيد الدفع'}</button>
          </div>
        </div>
      </div>}

      {/* Modal: إرجاع رأس المال من عملية */}
      {returnModal && <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setReturnModal(null)}>
        <div className="modal">
          <div className="modal-header"><span className="modal-title">إرجاع رأس المال من العملية</span><button className="modal-close" onClick={()=>setReturnModal(null)}>✕</button></div>
          <div className="modal-body">
            <div style={{background:'rgba(61,127,255,.08)',border:'1px solid rgba(61,127,255,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>
              <div>العملية: <strong>{returnModal.deals?.deal_number} — {returnModal.deals?.name}</strong></div>
              <div style={{marginTop:4}}>المبلغ الممول: <strong>{fmt(returnModal.amount)}</strong></div>
              <div style={{marginTop:4}}>تم إرجاعه سابقاً: <strong style={{color:'var(--green)'}}>{fmt(returnModal.principal_returned)}</strong></div>
              <div style={{marginTop:4}}>المتبقي للإرجاع: <strong style={{color:'var(--amber)'}}>{fmt(Number(returnModal.amount)-Number(returnModal.principal_returned||0))}</strong></div>
            </div>
            <div className="form-group"><label className="form-label">المبلغ المُرجَع (ج.م)</label>
              <input className="form-input" type="number" value={retForm.amount} onChange={e=>setRetForm({...retForm,amount:e.target.value})} placeholder="0"/>
            </div>
            <div className="form-group"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={retForm.notes} onChange={e=>setRetForm({...retForm,notes:e.target.value})} placeholder="اختياري"/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="topbar-btn btn-ghost" onClick={()=>setReturnModal(null)}>إلغاء</button>
            <button className="topbar-btn btn-primary" onClick={saveCapitalReturn} disabled={saving}>{saving?'جاري الحفظ...':'تأكيد الإرجاع'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

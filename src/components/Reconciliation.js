function Reconciliation() {
  const [result, setResult]   = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const [{ data: rc }, { data: ac }, { data: ic }] = await Promise.all([
        sb.rpc('run_reconciliation_check'),
        sb.from('v_account_reconciliation').select('*'),
        sb.from('v_investor_reconciliation').select('*'),
      ]);
      setResult(rc);
      setAccounts(ac || []);
      setInvestors(ic || []);
    } catch(err) {
      showError(err);
    }
    setLoading(false);
  };

  return (
    <div className="content">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>مطابقة الأرصدة</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>تحقق من تطابق الأرصدة المسجلة مع المحسوبة من الحركات</div>
        </div>
        <button className="topbar-btn btn-primary" onClick={runCheck} disabled={loading}>
          {loading ? 'جاري الفحص...' : '▶ تشغيل الفحص'}
        </button>
      </div>

      {result && <div style={{marginBottom:20,background: result.clean ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)', border:`1px solid ${result.clean ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`, borderRadius:12,padding:'16px 20px'}}>
        <div style={{fontWeight:700,fontSize:15,color: result.clean ? 'var(--green)' : 'var(--red)',marginBottom:6}}>
          {result.clean ? '✅ النتيجة: الأرصدة متطابقة' : `❌ توجد فروقات — حسابات: ${result.account_discrepancies} | ممولون: ${result.investor_discrepancies}`}
        </div>
        <div style={{fontSize:12,color:'var(--text2)'}}>وقت الفحص: {new Date(result.checked_at).toLocaleString('ar-EG')}</div>
      </div>}

      {/* Account Reconciliation */}
      <div className="section" style={{marginBottom:16}}>
        <div className="section-header"><span className="section-title">مطابقة الحسابات</span></div>
        {accounts.length === 0
          ? <div className="empty"><div className="empty-icon">🏦</div><div className="empty-title">اضغط "تشغيل الفحص" أولاً</div></div>
          : <table className="table">
              <thead><tr><th>الحساب</th><th>الرصيد المسجّل</th><th>الرصيد المحسوب</th><th>الفرق</th><th>الحالة</th></tr></thead>
              <tbody>{accounts.map(a=>(
                <tr key={a.id}>
                  <td style={{fontWeight:600}}>{a.name}</td>
                  <td>{fmt(a.recorded_balance)}</td>
                  <td>{fmt(a.computed_balance)}</td>
                  <td style={{color: Math.abs(a.discrepancy) > 0.01 ? 'var(--red)' : 'var(--green)', fontWeight:600}}>
                    {fmt(a.discrepancy)}
                  </td>
                  <td><span className={`badge ${Math.abs(a.discrepancy) > 0.01 ? 'badge-red' : 'badge-green'}`}>
                    {Math.abs(a.discrepancy) > 0.01 ? '❌ فرق' : '✅ متطابق'}
                  </span></td>
                </tr>
              ))}</tbody>
            </table>}
      </div>

      {/* Investor Reconciliation */}
      <div className="section">
        <div className="section-header"><span className="section-title">مطابقة أرصدة الممولين</span></div>
        {investors.length === 0
          ? <div className="empty"><div className="empty-icon">💰</div><div className="empty-title">اضغط "تشغيل الفحص" أولاً</div></div>
          : <table className="table">
              <thead><tr><th>الممول</th><th>المتاح (مسجّل)</th><th>المتاح (محسوب)</th><th>الفرق</th><th>الربح الصافي</th><th>الحالة</th></tr></thead>
              <tbody>{investors.map(i=>{
                const diff = Number(i.recorded_available||0) - Number(i.computed_available||0);
                return <tr key={i.id}>
                  <td style={{fontWeight:600}}>{i.name}</td>
                  <td>{fmt(i.recorded_available)}</td>
                  <td>{fmt(i.computed_available)}</td>
                  <td style={{color: Math.abs(diff) > 0.01 ? 'var(--red)' : 'var(--green)', fontWeight:600}}>{fmt(diff)}</td>
                  <td style={{color:'var(--amber)'}}>{fmt(i.computed_profit_net)}</td>
                  <td><span className={`badge ${Math.abs(diff) > 0.01 ? 'badge-red' : 'badge-green'}`}>
                    {Math.abs(diff) > 0.01 ? '❌ فرق' : '✅ متطابق'}
                  </span></td>
                </tr>;
              })}</tbody>
            </table>}
      </div>
    </div>
  );
}
